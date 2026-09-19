import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import solid from 'vite-plugin-solid'
import { expect, it } from 'vitest'
import { parsePo, formatPo } from '../src/compiler/po.ts'
import { extract, transform } from '../src/compiler/transform.ts'
import { i18n } from '../src/integrations/vite.ts'
import { fixture, json } from './helpers/fixture.ts'

const options = {
  solid: true,
  locales: ['en', 'zh'],
  baseLocale: 'en',
  catalog: {
    'Hello': { zh: '你好' },
    'Read <a>docs</a>.': { zh: '阅读<a>文档</a>。' },
  },
}

it('extracts Solid macros', async () => {
  await expect(
    json(extract(fixture('solid/mixed/input.tsx'), 'component.tsx')),
  ).toMatchFileSnapshot('fixtures/solid/mixed/messages.json')
})

it.each([undefined, 'zh'])(
  'compiles Solid JSX (static: %s)',
  async (staticLocale) => {
    const result = transform(
      fixture('solid/mixed/input.tsx'),
      'component.tsx',
      {
        ...options,
        staticLocale,
      },
    )!
    await expect(result.code).toMatchFileSnapshot(
      `fixtures/solid/mixed/${staticLocale ? 'static-zh' : 'dynamic'}.tsx`,
    )
    expect(result.code).not.toContain('best-i18n/react')
    expect(result.code.includes('best-i18n/solid')).toBe(
      staticLocale === undefined,
    )
  },
)

it.each(
  ['client', 'server', 'hydrate'].flatMap((mode) =>
    [undefined, 'en', 'zh'].map((staticLocale) => ({ mode, staticLocale })),
  ),
)(
  'runs Solid $mode output (static: $staticLocale)',
  async ({ mode, staticLocale }) => {
    const dir = mkdtempSync(
      fileURLToPath(new URL('./.solid-build-', import.meta.url)),
    )
    try {
      const input = path.join(dir, 'component.tsx')
      writeFileSync(input, fixture('solid/mixed/input.tsx'))
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
      const po = parsePo(
        readFileSync(path.join(messagesDir, 'zh.po'), 'utf8'),
        'zh',
      )
      expect(po.entries).toHaveLength(5)
      po.headers = { ...po.headers, 'plural-forms': 'nplurals=1; plural=0;' }
      for (const entry of po.entries) {
        if (entry.source === 'Hello') entry.target = '你好'
        else if (entry.source === 'Read <a>docs</a>.')
          entry.target = '阅读<a>文档</a>。'
        else if (entry.source === 'Open') entry.target = '打开'
        else if (entry.source === 'Hi {0}, <b><i>welcome</i></b>!')
          entry.target = '<b><i>欢迎</i></b>，{0}！'
        else {
          entry.target = '{0} 项'
          entry.pluralTargets = []
        }
      }
      writeFileSync(path.join(messagesDir, 'zh.po'), formatPo(po))
      const runtime = new URL('../src/solid.ts', import.meta.url).href
      async function compile(target: string, filename: string) {
        const result = await build({
          configFile: false,
          root: dir,
          logLevel: 'silent',
          plugins: [
            i18n({
              messagesDir,
              locales: ['en', 'zh'],
              baseLocale: 'en',
              solid: true,
              staticLocale,
              runtimeModule: runtime,
            }),
            solid({ ssr: true }),
          ],
          build: {
            ...(target === 'server'
              ? { ssr: input }
              : { lib: { entry: input, formats: ['es'] } }),
            write: false,
            minify: false,
            rollupOptions: { external: [/^solid-js(?:\/|$)/, runtime] },
          },
        })
        const output = Array.isArray(result) ? result[0] : result
        if (!output || !('output' in output))
          throw new Error('Expected build output')
        const chunk = output.output.find((item) => item.type === 'chunk')!
        expect(chunk.code.includes(runtime)).toBe(staticLocale === undefined)
        expect(chunk.code).not.toContain('/macro')
        writeFileSync(path.join(dir, filename), chunk.code)
      }
      await compile(mode === 'server' ? 'server' : 'client', 'component.mjs')
      if (mode === 'hydrate') {
        await compile('server', 'ssr.mjs')
        writeFileSync(
          path.join(dir, 'render.mjs'),
          fixture('solid/vite-build/hydrate-server.mjs').replace(
            "'best-i18n/server'",
            JSON.stringify(
              new URL('../src/runtime/server.ts', import.meta.url).href,
            ),
          ),
        )
        execFileSync(process.execPath, [path.join(dir, 'render.mjs')], {
          env: { ...process.env, STATIC_LOCALE: staticLocale ?? '' },
        })
      }
      const runner = path.join(dir, 'run.mjs')
      writeFileSync(
        runner,
        fixture(`solid/vite-build/${mode}.mjs`)
          .replace("'best-i18n/solid'", JSON.stringify(runtime))
          .replace(
            "'best-i18n/server'",
            JSON.stringify(
              new URL('../src/runtime/server.ts', import.meta.url).href,
            ),
          ),
      )
      expect(
        execFileSync(
          process.execPath,
          [...(mode !== 'server' ? ['--conditions=browser'] : []), runner],
          {
            encoding: 'utf8',
            env: { ...process.env, STATIC_LOCALE: staticLocale ?? '' },
          },
        ).trim(),
      ).toBe('ok')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
)

it('tracks locale changes in computations and disposes each owner', () => {
  const dir = mkdtempSync(
    fileURLToPath(new URL('./.solid-runtime-', import.meta.url)),
  )
  try {
    const runner = path.join(dir, 'run.mjs')
    writeFileSync(
      runner,
      fixture('solid/reactive-locale/run.mjs').replace(
        "'best-i18n/solid'",
        JSON.stringify(new URL('../src/solid.ts', import.meta.url).href),
      ),
    )
    expect(
      execFileSync(process.execPath, ['--conditions=browser', runner], {
        encoding: 'utf8',
      }).trim(),
    ).toBe('ok')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

it.each(['react-hook', 'empty-trans', 'trans-props', 'macro-reference'])(
  'rejects Solid macro misuse: %s',
  async (name) => {
    let error: unknown
    try {
      transform(fixture(`solid/${name}/input.tsx`), 'Component.tsx', options)
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(Error)
    await expect(`${(error as Error).message}\n`).toMatchFileSnapshot(
      `fixtures/solid/${name}/error.txt`,
    )
  },
)
