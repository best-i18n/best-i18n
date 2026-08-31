import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { rolldown } from 'rolldown'
import { describe, expect, it } from 'vitest'

import { formatPo } from '../src/compiler/po.ts'
import { i18n } from '../src/integrations/rolldown.ts'

import type { PoEntry } from '../src/compiler/po.ts'

const entry = (partial: Partial<PoEntry>): PoEntry => ({
  context: '',
  source: '',
  target: '',
  references: [],
  fuzzy: false,
  obsolete: false,
  ...partial,
})

/** A fixture project: an entry module with messages, plus its catalogs. */
function scaffold(): { dir: string; input: string; messagesDir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'best-i18n-rolldown-'))

  const messagesDir = path.join(dir, 'messages')
  mkdirSync(messagesDir)
  writeFileSync(
    path.join(messagesDir, 'messages.pot'),
    formatPo({
      locale: 'en',
      entries: [
        entry({ source: 'About' }),
        entry({ source: 'Hi {name}' }),
        entry({ source: 'One item', pluralSource: '{n} items' }),
      ],
    }),
  )
  writeFileSync(
    path.join(messagesDir, 'zh.po'),
    formatPo({
      locale: 'zh',
      headers: { 'Plural-Forms': 'nplurals=1; plural=0;' },
      entries: [
        entry({ source: 'About', target: '关于' }),
        entry({ source: 'Hi {name}', target: '你好 {name}' }),
        entry({
          source: 'One item',
          pluralSource: '{n} items',
          target: '{n} 件',
        }),
      ],
    }),
  )

  const input = path.join(dir, 'entry.ts')
  writeFileSync(
    input,
    [
      "import { plural, t } from 'best-i18n/macro'",
      'export const about = t`About`',
      'export const hi = (name: string) => t`Hi ${name}`',
      'export const items = (n: number) => plural(n, `One item`, `${n} items`)',
    ].join('\n'),
  )

  return { dir, input, messagesDir }
}

async function bundle(options: {
  input: string
  messagesDir: string
  staticLocale?: string
}): Promise<string> {
  const build = await rolldown({
    input: options.input,
    external: [/^best-i18n(\/|$)/],
    plugins: [
      i18n({
        messagesDir: options.messagesDir,
        locales: ['en', 'zh'],
        baseLocale: 'en',
        ...(options.staticLocale === undefined
          ? {}
          : { staticLocale: options.staticLocale }),
      }),
    ],
  })
  const { output } = await build.generate({ format: 'esm' })
  await build.close()
  return output[0]!.code
}

describe('rolldown plugin', () => {
  it('inlines both locales through a real rolldown build', async () => {
    const { input, messagesDir } = scaffold()
    const code = await bundle({ input, messagesDir })

    expect(code).toContain('关于')
    expect(code).toContain('About')
    expect(code).toContain('你好 ${name}')
    // The zh plural has one form: no dispatch, just the string.
    expect(code).toContain('`${n} 件`')
    // The en fallback dispatches on the Germanic formula.
    expect(code).toContain('__i18nN != 1')
    expect(code).toContain('getLocale')
  })

  it('collapses to pure literals in a per-locale build', async () => {
    const { input, messagesDir } = scaffold()
    const code = await bundle({ input, messagesDir, staticLocale: 'zh' })

    expect(code).toContain('关于')
    expect(code).not.toContain('About')
    expect(code).not.toContain('getLocale')
    expect(code).toContain('`${n} 件`')
    expect(code).not.toContain('One item')
  })

  it('leaves files without macros untouched', async () => {
    const { dir, messagesDir } = scaffold()
    const input = path.join(dir, 'plain.ts')
    writeFileSync(input, 'export const x = `About`\n')

    const code = await bundle({ input, messagesDir })

    expect(code).toContain('`About`')
    expect(code).not.toContain('getLocale')
  })
})
