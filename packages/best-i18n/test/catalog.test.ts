import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadCatalog } from '../src/compiler/catalog.ts'
import { formatPo } from '../src/compiler/po.ts'

import type { PoEntry } from '../src/compiler/po.ts'

const entry = (overrides: Partial<PoEntry>): PoEntry => ({
  context: '',
  source: 'Hello',
  target: '',
  references: [],
  fuzzy: false,
  obsolete: false,
  ...overrides,
})

function writeCatalog(entries: {
  template: PoEntry[]
  zh: PoEntry[]
  zhHeaders?: Record<string, string>
}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'best-i18n-'))
  writeFileSync(
    path.join(dir, 'messages.pot'),
    formatPo({ locale: 'en', entries: entries.template }),
  )
  writeFileSync(
    path.join(dir, 'zh.po'),
    formatPo({
      locale: 'zh',
      entries: entries.zh,
      ...(entries.zhHeaders === undefined
        ? {}
        : { headers: entries.zhHeaders }),
    }),
  )
  return dir
}

describe('loadCatalog', () => {
  it('loads translated entries', () => {
    const dir = writeCatalog({
      template: [entry({})],
      zh: [entry({ target: '你好' })],
    })

    const { catalog } = loadCatalog({
      messagesDir: dir,
      locales: ['en', 'zh'],
      baseLocale: 'en',
    })

    expect(catalog.Hello).toEqual({ en: 'Hello', zh: '你好' })
  })

  it('does not ship fuzzy translations', () => {
    // The merge marked this "written for the old wording, needs review".
    // Building it verbatim would be silently wrong; the message falls back to
    // the base locale and shows up in the transform's missing report instead.
    const dir = writeCatalog({
      template: [entry({})],
      zh: [entry({ target: '旧翻译', fuzzy: true })],
    })

    const { catalog } = loadCatalog({
      messagesDir: dir,
      locales: ['en', 'zh'],
      baseLocale: 'en',
    })

    expect(catalog.Hello).toEqual({ en: 'Hello' })
  })

  it('keys contexts separately and loads plural entries', () => {
    const dir = writeCatalog({
      template: [
        entry({ context: 'verb', source: 'Open' }),
        entry({ source: 'One item', pluralSource: '{n} items' }),
      ],
      zh: [
        entry({ context: 'verb', source: 'Open', target: '打开' }),
        entry({
          source: 'One item',
          pluralSource: '{n} items',
          target: '{n} 件',
        }),
      ],
      zhHeaders: { 'Plural-Forms': 'nplurals=1; plural=0;' },
    })

    const { catalog, plurals } = loadCatalog({
      messagesDir: dir,
      locales: ['en', 'zh'],
      baseLocale: 'en',
    })

    expect(catalog['verb\u0004Open']).toEqual({ en: 'Open', zh: '打开' })
    expect(catalog['One item\u0005{n} items']).toEqual({
      en: ['One item', '{n} items'],
      zh: ['{n} 件'],
    })
    expect(plurals.zh).toEqual({ nplurals: 1, formula: '0' })
    // Base locale defaults to the builtin rule.
    expect(plurals.en).toEqual({ nplurals: 2, formula: 'n != 1' })
  })

  it('drops a plural entry whose form count disagrees with the header', () => {
    const dir = writeCatalog({
      template: [entry({ source: 'One item', pluralSource: '{n} items' })],
      zh: [
        entry({
          source: 'One item',
          pluralSource: '{n} items',
          target: '一件',
          pluralTargets: ['{n} 件'],
        }),
      ],
      zhHeaders: { 'Plural-Forms': 'nplurals=1; plural=0;' },
    })

    const { catalog } = loadCatalog({
      messagesDir: dir,
      locales: ['en', 'zh'],
      baseLocale: 'en',
    })

    expect(catalog['One item\u0005{n} items']!.zh).toBeUndefined()
  })
})
