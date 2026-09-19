import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compile, compileModule } from 'svelte/compiler'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { formatPo, parsePo } from '../src/compiler/po.ts'
import { extract, transform } from '../src/compiler/transform.ts'
import { i18n } from '../src/integrations/vite.ts'
import { fixture, json } from './helpers/fixture.ts'
import type { Plugin } from 'vite'

const options = {
  locales: ['en', 'zh'],
  baseLocale: 'en',
  catalog: { 'Hello': { zh: '你好' }, 'Hi {name}': { zh: '你好 {name}' } },
}

function pluginTransform(plugin: Plugin) {
  const hook = plugin.transform
  if (typeof hook !== 'function') {
    throw new TypeError('expected a transform function')
  }
  return hook
}

const pluginCtx = { warn() {} }

describe('svelte translation macros', () => {
  it.each(['notes', 'mixed', 'trans'])(
    'extracts %s with original source locations',
    async (name) => {
      const messages = extract(
        fixture(`svelte/${name}/input.svelte`),
        'Page.svelte',
      )
      await expect(json(messages)).toMatchFileSnapshot(
        `fixtures/svelte/${name}/messages.json`,
      )
    },
  )

  it('uses reactive locale reads in rune modules', async () => {
    const result = transform(
      fixture('svelte/rune-module/input.svelte.ts'),
      'title.svelte.ts',
      options,
    )!
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/svelte/rune-module/output.svelte.ts',
    )
    expect(() =>
      compileModule(result.code, { filename: 'title.svelte.ts' }),
    ).not.toThrow()
  })

  it.each([
    { name: 'dynamic', staticLocale: undefined },
    { name: 'static-zh', staticLocale: 'zh' },
  ])(
    'produces valid Svelte for client and SSR ($name)',
    async ({ name, staticLocale }) => {
      const result = transform(
        fixture('svelte/mixed/input.svelte'),
        'Page.svelte',
        { ...options, staticLocale },
      )!
      await expect(result.code).toMatchFileSnapshot(
        `fixtures/svelte/mixed/${name}.svelte`,
      )
      expect(result.map.sources).toEqual(['Page.svelte'])
      for (const generate of ['client', 'server'] as const) {
        expect(() =>
          compile(result.code, { filename: 'Page.svelte', generate }),
        ).not.toThrow()
      }
    },
  )

  it.each(['module-script', 'instance-scope'])(
    'preserves %s bindings',
    async (name) => {
      const result = transform(
        fixture(`svelte/${name}/input.svelte`),
        'Page.svelte',
        options,
      )!
      await expect(result.code).toMatchFileSnapshot(
        `fixtures/svelte/${name}/output.svelte`,
      )
      await expect(json(result.messages)).toMatchFileSnapshot(
        `fixtures/svelte/${name}/messages.json`,
      )
      expect(() => compile(result.code, { generate: 'server' })).not.toThrow()
    },
  )

  it.each([
    { name: 'dynamic', staticLocale: undefined },
    { name: 'static-zh', staticLocale: 'zh' },
  ])('rebuilds <Trans> markup for $name', async ({ name, staticLocale }) => {
    const result = transform(
      fixture('svelte/trans/input.svelte'),
      'Page.svelte',
      {
        locales: ['en', 'zh'],
        baseLocale: 'en',
        staticLocale,
        catalog: {
          'Hello': { zh: '你好' },
          'Read the <a>docs</a> to learn more.': {
            zh: '阅读<a>文档</a>了解更多。',
          },
          'Hi {name}, you have <b>{count} items</b>.': {
            zh: '你好 {name}，你有 <b>{count} 项</b>。',
          },
          'Just words.': { zh: '只有文字。' },
          'verb\u0004Open': { zh: '打开' },
          'A <i>b <b>c</b></i> d': { zh: 'D <i><b>C</b> B</i> A' },
          'Line one<br/>line two': { zh: '第一行<br/>第二行' },
        },
      },
    )!
    await expect(result.code).toMatchFileSnapshot(
      `fixtures/svelte/trans/${name}.svelte`,
    )
    if (staticLocale === undefined) {
      await expect(json(result.messages)).toMatchFileSnapshot(
        'fixtures/svelte/trans/messages.json',
      )
    }
    expect(result.code).not.toContain('best-i18n/svelte/macro')
    expect(result.code).not.toContain('best-i18n/macro')
    for (const generate of ['client', 'server'] as const) {
      expect(() =>
        compile(result.code, { filename: 'Page.svelte', generate }),
      ).not.toThrow()
    }
  })

  it('resolves an aliased Svelte <Trans>', () => {
    const messages = extract(
      [
        "<script>import { Trans as T } from 'best-i18n/svelte/macro'</script>",
        '<T>Hi {name}</T>',
      ].join(''),
      'Page.svelte',
    )
    expect(messages.map((message) => message.text)).toEqual(['Hi {name}'])
  })

  it.each([
    'react-macro',
    'shadow-each',
    'macro-reference',
    'macro-action',
    'shadow-index',
    'trans-if-block',
    'trans-empty',
    'trans-props',
  ])('rejects %s', async (name) => {
    let error: unknown
    try {
      extract(fixture(`svelte/${name}/input.svelte`), 'Page.svelte')
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(Error)
    await expect(`${(error as Error).message}\n`).toMatchFileSnapshot(
      `fixtures/svelte/${name}/error.txt`,
    )
  })

  it.each(['plain-text', 'no-macro'])('ignores %s', (name) => {
    const source = fixture(`svelte/${name}/input.svelte`)
    expect(transform(source, 'Page.svelte', options)).toBeNull()
    expect(extract(source, 'Page.svelte')).toEqual([])
  })

  it('compiles .svelte only when svelte is enabled', () => {
    const dir = mkdtempSync(
      fileURLToPath(new URL('./.svelte-test-', import.meta.url)),
    )
    try {
      const messagesDir = path.join(dir, 'messages')
      mkdirSync(messagesDir)
      writeFileSync(
        path.join(messagesDir, 'messages.pot'),
        formatPo({ locale: 'en', entries: [] }),
      )
      const source = fixture('svelte/mixed/input.svelte')
      expect(
        pluginTransform(
          i18n({ messagesDir, locales: ['en'], baseLocale: 'en' }),
        ).call(pluginCtx, source, 'Page.svelte'),
      ).toBeNull()

      const result = pluginTransform(
        i18n({
          messagesDir,
          locales: ['en'],
          baseLocale: 'en',
          svelte: true,
        }),
      ).call(pluginCtx, source, 'Page.svelte') as { code: string } | null
      expect(result).not.toBeNull()
      expect(result!.code).not.toContain('best-i18n/macro')
      expect(
        pluginTransform(
          i18n({
            messagesDir,
            locales: ['en'],
            baseLocale: 'en',
            svelte: true,
          }),
        ).call(pluginCtx, source, 'Page.svelte?svelte&type=style'),
      ).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reacts to locale changes in Svelte effects and cleans up subscriptions', async () => {
    const dir = mkdtempSync(
      fileURLToPath(new URL('./.svelte-test-', import.meta.url)),
    )
    try {
      const runtime = pathToFileURL(
        fileURLToPath(new URL('../src/svelte.ts', import.meta.url)),
      ).href
      const source = fixture('svelte/reactive-locale/input.svelte.js').replace(
        "'best-i18n/svelte'",
        JSON.stringify(runtime),
      )
      const test = compileModule(source, {
        filename: 'test.svelte.js',
        generate: 'client',
      }).js.code
      writeFileSync(path.join(dir, 'test.mjs'), test)
      const runner = path.join(dir, 'run.mjs')
      writeFileSync(runner, fixture('svelte/reactive-locale/run.mjs'))
      const stdout = execFileSync(
        process.execPath,
        ['--conditions=browser', runner],
        { encoding: 'utf8' },
      )
      await expect(json(JSON.parse(stdout))).toMatchFileSnapshot(
        'fixtures/svelte/reactive-locale/values.json',
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

it.each([undefined, 'zh'])(
  'extracts PO catalogs and renders through Vite (staticLocale: %s)',
  async (staticLocale) => {
    const dir = mkdtempSync(
      fileURLToPath(new URL('./.svelte-build-', import.meta.url)),
    )
    try {
      const input = path.join(dir, 'Page.svelte')
      writeFileSync(input, fixture('svelte/vite-build/input.svelte'))
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
      expect(catalog.entries.map((entry) => entry.source)).toEqual(['Hello'])
      expect(catalog.entries[0]!.references).toEqual([`${input}:1`])
      catalog.entries[0]!.target = '你好'
      writeFileSync(path.join(messagesDir, 'zh.po'), formatPo(catalog))
      const runtime = new URL('../src/svelte.ts', import.meta.url).href
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
            svelte: true,
          }),
          {
            name: 'test-svelte-compiler',
            enforce: 'pre',
            transform(code, id) {
              if (!id.endsWith('.svelte')) return null
              return compile(code, { filename: id, generate: 'server' }).js
            },
          },
        ],
        build: {
          ssr: input,
          write: false,
          minify: false,
          rollupOptions: { external: [runtime] },
        },
      })
      if (Array.isArray(result) || !('output' in result))
        throw new Error('Expected one build output')
      const chunk = result.output[0]!
      if (chunk.type !== 'chunk') throw new Error('Expected JavaScript output')
      expect(chunk.code).not.toContain('best-i18n/macro')
      writeFileSync(path.join(dir, 'component.mjs'), chunk.code)
      const runner = path.join(dir, 'render.mjs')
      writeFileSync(
        runner,
        fixture('svelte/vite-build/render.mjs').replace(
          "'best-i18n/server'",
          JSON.stringify(
            new URL('../src/runtime/server.ts', import.meta.url).href,
          ),
        ),
      )
      const stdout = execFileSync(process.execPath, [runner], {
        encoding: 'utf8',
      })
      await expect(stdout).toMatchFileSnapshot(
        'fixtures/svelte/vite-build/output.html',
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
)
