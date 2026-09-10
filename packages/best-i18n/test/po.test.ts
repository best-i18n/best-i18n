import { describe, expect, it } from 'vitest'

import { formatPo, parsePo, samePo } from '../src/compiler/po.ts'
import type { PoEntry } from '../src/compiler/po.ts'
import { fixture } from './helpers/fixture.ts'

const entry = (overrides: Partial<PoEntry>): PoEntry => ({
  context: '',
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
        entry({ source: 'Bye', target: '再见', fuzzy: true }),
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

  it('preserves headers a translator or TMS set', async () => {
    const text = fixture('po/headers/input.po')

    // The whole formatted file, headers included, as a translator would see it.
    await expect(formatPo(parsePo(text, 'zh'))).toMatchFileSnapshot(
      'fixtures/po/headers/output.po',
    )
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
      'msgid "Live"',
      'msgstr "活"',
      '',
      '#~| msgid "Old wording"',
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

/**
 * Cases borrowed from `gettext-parser`'s own fixture corpus - the `.po` shapes
 * it keeps regression files for. They cover the seams between our hand-rolled
 * halves (lifting `#~` blocks out, writing them back with `escapePo`) and the
 * parser proper, which is where a file written by Poedit, msgmerge or a TMS
 * would land.
 */
describe('pO files as other tools write them', () => {
  const HEADER = [
    'msgid ""',
    'msgstr ""',
    '"Content-Type: text/plain; charset=utf-8\\n"',
    '',
  ].join('\n')

  const one = (body: string, locale = 'zh') =>
    parsePo(`${HEADER}\n${body}`, locale).entries

  it('reads a file with CRLF line endings', () => {
    // What a checkout on Windows, or an editor with the wrong setting, hands
    // us. The `#~` lifting splits on '\n' itself, so this is our seam.
    const text = `${HEADER}\n#~ msgid "gone"\n#~ msgstr "走了"\n\nmsgid "a"\nmsgstr "b"\n`

    expect(parsePo(text.replace(/\n/g, '\r\n'), 'zh').entries).toEqual(
      parsePo(text, 'zh').entries,
    )
  })

  it('reads a file that starts with a byte order mark', () => {
    expect(one('msgid "a"\nmsgstr "b"\n')).toEqual(
      parsePo(`﻿${HEADER}\nmsgid "a"\nmsgstr "b"\n`, 'zh').entries,
    )
  })

  it('joins a msgid split across continuation lines', () => {
    // The way every tool writes anything longer than a line.
    expect(one('msgid ""\n"one "\n"two"\nmsgstr "x"\n')[0]).toMatchObject({
      source: 'one two',
    })
  })

  it('finds a header whatever case it was written in', () => {
    // `loadCatalog` reads `headers['Plural-Forms']` by exact name, which is
    // only safe because the parser normalizes the known ones.
    const text = [
      'msgid ""',
      'msgstr ""',
      '"content-type: text/plain; charset=utf-8\\n"',
      '"plural-forms: nplurals=1; plural=0;\\n"',
      '',
      'msgid "a"',
      'msgstr "b"',
      '',
    ].join('\n')

    expect(parsePo(text, 'zh').headers?.['Plural-Forms']).toBe(
      'nplurals=1; plural=0;',
    )
  })

  it('takes the last of two entries with the same msgid', () => {
    // A hand-merged file can carry a duplicate; gettext itself errors, but
    // dropping one silently beats crashing a build over a catalog we are
    // about to rewrite anyway.
    expect(one('msgid "a"\nmsgstr "one"\n\nmsgid "a"\nmsgstr "two"\n')).toEqual(
      [expect.objectContaining({ source: 'a', target: 'two' })],
    )
  })

  it('round-trips a word too long for one line', () => {
    // gettext folds at column 77, and cannot break a word that has no
    // spaces in it - a minified asset name, a base64 blob in a msgid.
    const long = 'x'.repeat(100)
    const text = formatPo({
      locale: 'zh',
      entries: [entry({ source: long, target: long, references: [] })],
    })

    expect(
      text.split('\n').filter((line) => line.includes('x')).length,
    ).toBeGreaterThan(2)
    expect(parsePo(text, 'zh').entries[0]).toMatchObject({
      source: long,
      target: long,
    })
  })

  it('escapes tabs, quotes and backslashes on an obsolete entry', () => {
    // Obsolete entries are written by hand rather than by the codec, so this
    // is the one escaping path we own. Existing coverage stops at \r.
    const value = 'tab\there "quoted" back\\slash'
    const text = formatPo({
      locale: 'zh',
      entries: [
        entry({ source: value, target: value, references: [], obsolete: true }),
      ],
    })

    expect(text).toContain('#~ msgid "tab\\there \\"quoted\\" back\\\\slash"')
    expect(parsePo(text, 'zh').entries[0]).toMatchObject({
      source: value,
      target: value,
      obsolete: true,
    })
  })
})
