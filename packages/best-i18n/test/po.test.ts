import { describe, expect, it } from 'vitest'

import { formatPo, parsePo, samePo } from '../src/compiler/po.ts'

import type { PoEntry } from '../src/compiler/po.ts'

const entry = (overrides: Partial<PoEntry>): PoEntry => ({
  id: 'abc12345',
  source: 'Hello',
  target: '',
  references: ['src/a.tsx:3'],
  fuzzy: false,
  obsolete: false,
  ...overrides,
})

describe('pO round-trip', () => {
  it('survives parse -> format -> parse unchanged', () => {
    const file = {
      locale: 'zh',
      entries: [
        entry({ target: '你好' }),
        entry({ id: 'def67890', source: 'Bye', target: '再见', fuzzy: true }),
      ],
    }

    const once = parsePo(formatPo(file), 'zh')
    const twice = parsePo(formatPo(once), 'zh')

    expect(samePo(once, twice)).toBe(true)
    expect(twice.entries).toEqual(once.entries)
  })

  it('preserves extracted and translator comments', () => {
    const text = [
      'msgid ""',
      'msgstr ""',
      '"Language: zh\\n"',
      '',
      '# reviewed by Ana',
      '#. Button label on the home page',
      '#: src/a.tsx:3',
      'msgctxt "abc12345"',
      'msgid "Hello"',
      'msgstr "你好"',
    ].join('\n')

    const parsed = parsePo(text, 'zh')
    expect(parsed.entries[0]).toMatchObject({
      translator: 'reviewed by Ana',
      extracted: 'Button label on the home page',
    })

    const reparsed = parsePo(formatPo(parsed), 'zh')
    expect(reparsed.entries[0]).toMatchObject({
      translator: 'reviewed by Ana',
      extracted: 'Button label on the home page',
    })
  })

  it('preserves non-fuzzy flags', () => {
    const text = [
      'msgid ""',
      'msgstr ""',
      '',
      '#, fuzzy, no-wrap',
      'msgctxt "abc12345"',
      'msgid "Hello"',
      'msgstr "你好"',
    ].join('\n')

    const parsed = parsePo(text, 'zh')
    expect(parsed.entries[0]).toMatchObject({
      fuzzy: true,
      flags: ['no-wrap'],
    })

    const reparsed = parsePo(formatPo(parsed), 'zh')
    expect(reparsed.entries[0]).toMatchObject({
      fuzzy: true,
      flags: ['no-wrap'],
    })
  })

  it('preserves gettext plural entries', () => {
    const text = [
      'msgid ""',
      'msgstr ""',
      '',
      'msgctxt "abc12345"',
      'msgid "One item"',
      'msgid_plural "{0} items"',
      'msgstr[0] "一件"',
      'msgstr[1] "{0} 件"',
    ].join('\n')

    const parsed = parsePo(text, 'zh')
    expect(parsed.entries[0]).toMatchObject({
      source: 'One item',
      pluralSource: '{0} items',
      target: '一件',
      pluralTargets: ['{0} 件'],
    })

    const reparsed = parsePo(formatPo(parsed), 'zh')
    expect(reparsed.entries[0]).toMatchObject({
      pluralSource: '{0} items',
      pluralTargets: ['{0} 件'],
    })
  })

  it('preserves headers a translator or TMS set', () => {
    const text = [
      'msgid ""',
      'msgstr ""',
      '"Language: zh\\n"',
      '"Plural-Forms: nplurals=1; plural=0;\\n"',
      '"Last-Translator: Ana <ana@example.com>\\n"',
      '"X-Generator: Weblate 5.0\\n"',
      '',
      'msgctxt "abc12345"',
      'msgid "Hello"',
      'msgstr "你好"',
    ].join('\n')

    const output = formatPo(parsePo(text, 'zh'))

    expect(output).toContain('Plural-Forms: nplurals=1; plural=0;')
    expect(output).toContain('Last-Translator: Ana <ana@example.com>')
    expect(output).toContain('X-Generator: Weblate 5.0')
  })

  it('keeps fuzzy state and references on obsolete entries', () => {
    const file = {
      locale: 'zh',
      entries: [
        entry({
          target: '你好',
          fuzzy: true,
          translator: 'needs review',
          obsolete: true,
        }),
      ],
    }

    const reparsed = parsePo(formatPo(file), 'zh')

    expect(reparsed.entries[0]).toMatchObject({
      obsolete: true,
      fuzzy: true,
      translator: 'needs review',
      references: ['src/a.tsx:3'],
    })
  })

  it('routes obsolete previous-msgid lines to the obsolete entry', () => {
    const text = [
      'msgid ""',
      'msgstr ""',
      '',
      'msgctxt "live0001"',
      'msgid "Live"',
      'msgstr "活"',
      '',
      '#~| msgid "Old wording"',
      '#~ msgctxt "dead0001"',
      '#~ msgid "Gone"',
      '#~ msgstr "走了"',
    ].join('\n')

    const parsed = parsePo(text, 'zh')

    expect(parsed.entries).toHaveLength(2)
    expect(parsed.entries[1]).toMatchObject({
      source: 'Gone',
      obsolete: true,
      previous: 'msgid "Old wording"',
    })
    // The live document must not have inherited the stray `#|` line.
    expect(parsed.entries[0]).toMatchObject({ source: 'Live', obsolete: false })
  })

  it('escapes carriage returns', () => {
    const file = {
      locale: 'zh',
      entries: [entry({ source: 'a\rb', target: 'c\rd', obsolete: true })],
    }

    const output = formatPo(file)
    expect(output).toContain(String.raw`a\rb`)

    const reparsed = parsePo(output, 'zh')
    expect(reparsed.entries[0]).toMatchObject({
      source: 'a\rb',
      target: 'c\rd',
    })
  })
})
