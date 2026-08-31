import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadCatalog } from '../src/compiler/catalog.ts'
import { formatPo } from '../src/compiler/po.ts'

import type { PoEntry } from '../src/compiler/po.ts'

const entry = (overrides: Partial<PoEntry>): PoEntry => ({
  id: 'abc12345',
  source: 'Hello',
  target: '',
  references: [],
  fuzzy: false,
  obsolete: false,
  ...overrides,
})

function writeCatalog(entries: { template: PoEntry[]; zh: PoEntry[] }): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'best-i18n-'))
  writeFileSync(
    path.join(dir, 'messages.pot'),
    formatPo({ locale: 'en', entries: entries.template }),
  )
  writeFileSync(
    path.join(dir, 'zh.po'),
    formatPo({ locale: 'zh', entries: entries.zh }),
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
})
