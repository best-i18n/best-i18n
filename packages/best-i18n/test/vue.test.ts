import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vuePlugin from '@vitejs/plugin-vue'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { compileScript, compileTemplate, parse } from 'vue/compiler-sfc'
import { formatPo, parsePo } from '../src/compiler/po.ts'
import { extract, transform } from '../src/compiler/transform.ts'
import { i18n } from '../src/integrations/vite.ts'
import { fixture, json } from './helpers/fixture.ts'

function pluginTransform(plugin: ReturnType<typeof i18n>) {
  const hook = plugin.transform
  if (typeof hook !== 'function') {
    throw new TypeError('expected a transform function')
  }
  const ctx = { warn() {} } as unknown as ThisParameterType<typeof hook>
  return (code: string, id: string) => hook.call(ctx, code, id)
}

const options = {
  locales: ['en', 'zh'],
  baseLocale: 'en',
  catalog: {
    'Hello': { zh: '你好' },
    "Say 'hi'": { zh: '说“嗨”' },
    'Hi {0}': { zh: '你好 {0}' },
    'verb\u0004Open': { zh: '打开' },
    'Read the <a>docs</a> to learn <b>more</b>.': {
      zh: '阅读<a>文档</a>了解<b>更多</b>。',
    },
    'Line one<br/>line two': { zh: '第一行<br/>第二行' },
  },
}

/** Compiles a transformed SFC the way @vitejs/plugin-vue would; the errors. */
function compileSfc(code: string, filename: string): string[] {
  const { descriptor, errors } = parse(code, { filename })
  if (errors.length > 0) return errors.map((error) => error.message)
  const id = 'test'
  const script = descriptor.scriptSetup
    ? compileScript(descriptor, { id, inlineTemplate: false })
    : undefined
  if (descriptor.template === null) return []
  return compileTemplate({
    id,
    filename,
    source: descriptor.template.content,
    compilerOptions: { bindingMetadata: script?.bindings },
  }).errors.map((error) => (typeof error === 'string' ? error : error.message))
}

describe('vue translation macros', () => {
  it('extracts a component with original source locations', async () => {
    const messages = extract(fixture('vue/mixed/input.vue'), 'Page.vue')
    await expect(json(messages)).toMatchFileSnapshot(
      'fixtures/vue/mixed/messages.json',
    )
  })

  it.each([
    { name: 'dynamic', staticLocale: undefined },
    { name: 'static-zh', staticLocale: 'zh' },
  ])('compiles a component for $name', async ({ name, staticLocale }) => {
    const result = transform(fixture('vue/mixed/input.vue'), 'Page.vue', {
      ...options,
      staticLocale,
    })!
    await expect(result.code).toMatchFileSnapshot(
      `fixtures/vue/mixed/${name}.vue`,
    )
    expect(result.code).not.toContain('best-i18n/vue/macro')
    expect(result.code).not.toContain('best-i18n/macro')
    expect(result.code.includes('best-i18n/vue')).toBe(
      staticLocale === undefined,
    )
    expect(compileSfc(result.code, 'Page.vue')).toEqual([])
  })

  it('injects into a plain <script> when there is no <script setup>', async () => {
    const result = transform(
      fixture('vue/options-api/input.vue'),
      'Page.vue',
      options,
    )!
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/vue/options-api/output.vue',
    )
    expect(compileSfc(result.code, 'Page.vue')).toEqual([])
  })

  it('reads the locale through best-i18n/vue in plain modules of a Vue project', () => {
    const result = transform(
      "import { t } from 'best-i18n/macro'\nexport const title = () => t`Hello`\n",
      'title.ts',
      { ...options, vue: true },
    )!
    expect(result.code).toContain('from "best-i18n/vue"')
  })

  it.each([
    'react-macro',
    'trans-empty',
    'trans-props',
    'trans-template-child',
    'macro-reference',
  ])('rejects %s', async (name) => {
    let error: unknown
    try {
      extract(fixture(`vue/${name}/input.vue`), 'Page.vue')
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(Error)
    await expect(`${(error as Error).message}\n`).toMatchFileSnapshot(
      `fixtures/vue/${name}/error.txt`,
    )
  })

  it('compiles .vue only when vue is enabled', () => {
    const dir = mkdtempSync(
      fileURLToPath(new URL('./.vue-test-', import.meta.url)),
    )
    try {
      const messagesDir = path.join(dir, 'messages')
      mkdirSync(messagesDir)
      writeFileSync(
        path.join(messagesDir, 'messages.pot'),
        formatPo({ locale: 'en', entries: [] }),
      )
      const source = fixture('vue/vite-build/input.vue')
      const base = { messagesDir, locales: ['en'], baseLocale: 'en' }
      expect(pluginTransform(i18n(base))(source, 'Page.vue')).toBeNull()

      const result = pluginTransform(i18n({ ...base, vue: true }))(
        source,
        'Page.vue',
      ) as { code: string } | null
      expect(result).not.toBeNull()
      expect(result!.code).not.toContain('best-i18n/macro')
      expect(
        pluginTransform(i18n({ ...base, vue: true }))(
          source,
          'Page.vue?vue&type=style&index=0',
        ),
      ).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('tracks locale changes in watchEffect and stops with it', () => {
    const dir = mkdtempSync(
      fileURLToPath(new URL('./.vue-runtime-', import.meta.url)),
    )
    try {
      const runner = path.join(dir, 'run.mjs')
      writeFileSync(
        runner,
        fixture('vue/reactive-locale/run.mjs').replace(
          "'best-i18n/vue'",
          JSON.stringify(
            new URL('../src/frameworks/vue/index.ts', import.meta.url).href,
          ),
        ),
      )
      expect(
        execFileSync(process.execPath, [runner], { encoding: 'utf8' }).trim(),
      ).toBe('ok')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it.each([undefined, 'zh'])(
    'extracts PO catalogs and renders through Vite (staticLocale: %s)',
    async (staticLocale) => {
      const dir = mkdtempSync(
        fileURLToPath(new URL('./.vue-build-', import.meta.url)),
      )
      try {
        const input = path.join(dir, 'Page.vue')
        writeFileSync(input, fixture('vue/vite-build/input.vue'))
        const messagesDir = path.join(dir, 'messages')
        execFileSync(process.execPath, [
          fileURLToPath(new URL('../src/cli/extract.ts', import.meta.url)),
          '--src',
          dir,
          '--messages',
          messagesDir,
          '--locales',
          'en,zh',
        ])
        const catalog = parsePo(
          readFileSync(path.join(messagesDir, 'zh.po'), 'utf8'),
          'zh',
        )
        expect(catalog.entries.map((entry) => entry.source)).toEqual([
          'Hello',
          'Read the <a>docs</a>.',
        ])
        expect(catalog.entries[0]!.references).toEqual([`${input}:7`])
        catalog.entries[0]!.target = '你好'
        catalog.entries[1]!.target = '阅读<a>文档</a>。'
        writeFileSync(path.join(messagesDir, 'zh.po'), formatPo(catalog))
        const runtime = new URL(
          '../src/frameworks/vue/index.ts',
          import.meta.url,
        ).href
        const result = await build({
          configFile: false,
          root: dir,
          logLevel: 'silent',
          plugins: [
            i18n({
              messagesDir,
              locales: ['en', 'zh'],
              baseLocale: 'en',
              staticLocale,
              runtimeModule: runtime,
              vue: true,
            }),
            vuePlugin(),
          ],
          build: {
            ssr: input,
            write: false,
            minify: false,
            rollupOptions: { external: [runtime, /^vue(?:\/|$)/, /^@vue\//] },
          },
        })
        if (Array.isArray(result) || !('output' in result))
          throw new Error('Expected one build output')
        const chunk = result.output[0]!
        if (chunk.type !== 'chunk')
          throw new Error('Expected JavaScript output')
        expect(chunk.code).not.toContain('best-i18n/macro')
        expect(chunk.code.includes(runtime)).toBe(staticLocale === undefined)
        writeFileSync(path.join(dir, 'component.mjs'), chunk.code)
        const runner = path.join(dir, 'render.mjs')
        writeFileSync(
          runner,
          fixture('vue/vite-build/render.mjs').replace(
            "'best-i18n/server'",
            JSON.stringify(
              new URL('../src/runtime/server.ts', import.meta.url).href,
            ),
          ),
        )
        const stdout = execFileSync(process.execPath, [runner], {
          encoding: 'utf8',
        })
        // The dynamic build leaves Vue's SSR fragment anchors around the
        // `<template v-if>` blocks; the per-locale build has no blocks.
        await expect(stdout).toMatchFileSnapshot(
          `fixtures/vue/vite-build/output-${staticLocale ?? 'dynamic'}.html`,
        )
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  )
})
