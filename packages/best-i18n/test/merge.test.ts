import { describe, expect, it } from 'vitest'

import { mergeMessages } from '../src/compiler/merge.ts'

import type { SourceMessage } from '../src/compiler/merge.ts'
import type { PoEntry } from '../src/compiler/po.ts'

function entry(partial: Partial<PoEntry>): PoEntry {
  return {
    context: '',
    source: '',
    target: '',
    references: [],
    fuzzy: false,
    obsolete: false,
    ...partial,
  }
}

function message(
  partial: Partial<SourceMessage> & { text: string },
): SourceMessage {
  return { context: '', references: [], ...partial }
}

const ABOUT = 'About'
const ABOUT_US = 'About us'
const REF = 'src/routes/about.tsx:15'

describe('mergeMessages', () => {
  it('adds a brand new message with an empty translation', () => {
    const result = mergeMessages({
      found: [message({ text: ABOUT, references: [REF] })],
      existing: [],
    })

    expect(result.added).toEqual([ABOUT])
    expect(result.entries[0]).toMatchObject({ source: ABOUT, target: '' })
  })

  it('keeps the translation when nothing changed', () => {
    const result = mergeMessages({
      found: [message({ text: ABOUT, references: [REF] })],
      existing: [entry({ source: ABOUT, target: '关于', references: [REF] })],
    })

    expect(result.added).toEqual([])
    expect(result.carried).toEqual([])
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.target).toBe('关于')
    expect(result.entries[0]!.fuzzy).toBe(false)
  })

  it('keeps entries with different contexts apart', () => {
    const result = mergeMessages({
      found: [
        message({ text: 'Open', context: 'verb', references: [REF] }),
        message({
          text: 'Open',
          context: 'adjective',
          references: ['a.tsx:2'],
        }),
      ],
      existing: [
        entry({
          context: 'verb',
          source: 'Open',
          target: '打开',
          references: [REF],
        }),
      ],
    })

    const verb = result.entries.find((item) => item.context === 'verb')
    const adjective = result.entries.find(
      (item) => item.context === 'adjective',
    )
    expect(verb).toMatchObject({ target: '打开', fuzzy: false })
    expect(adjective).toMatchObject({ target: '' })
  })

  it('carries the translation across a rewording and marks it fuzzy', () => {
    const result = mergeMessages({
      found: [message({ text: ABOUT_US, references: [REF] })],
      existing: [entry({ source: ABOUT, target: '关于', references: [REF] })],
    })

    expect(result.added).toEqual([])
    expect(result.carried).toEqual([{ from: ABOUT, to: ABOUT_US }])

    const live = result.entries.filter((item) => !item.obsolete)
    expect(live).toHaveLength(1)
    expect(live[0]).toMatchObject({
      source: ABOUT_US,
      target: '关于',
      fuzzy: true,
      // What the carried translation was written for, msgmerge-style.
      previous: 'msgid "About"',
    })
    // The old entry was consumed, not left behind as obsolete.
    expect(result.obsoleted).toEqual([])
  })

  it('does not carry anything when the old entry was untranslated', () => {
    const result = mergeMessages({
      found: [message({ text: ABOUT_US, references: [REF] })],
      existing: [entry({ source: ABOUT, target: '', references: [REF] })],
    })

    expect(result.carried).toEqual([])
    expect(result.added).toEqual([ABOUT_US])
    expect(result.entries.filter((item) => item.obsolete)).toEqual([])
  })

  it('obsoletes a removed message but keeps its translation', () => {
    const result = mergeMessages({
      found: [],
      existing: [entry({ source: ABOUT, target: '关于', references: [REF] })],
    })

    expect(result.obsoleted).toEqual([ABOUT])
    expect(result.entries[0]).toMatchObject({
      target: '关于',
      obsolete: true,
      references: [],
    })
  })

  it('drops a removed message that had no translation', () => {
    const result = mergeMessages({
      found: [],
      existing: [entry({ source: ABOUT, target: '' })],
    })

    expect(result.entries).toEqual([])
  })

  it('does not let two new messages both claim one old reference', () => {
    const result = mergeMessages({
      found: [
        message({ text: 'First wording', references: [REF] }),
        message({ text: 'Second wording', references: [REF] }),
      ],
      existing: [entry({ source: 'Old', target: '旧', references: [REF] })],
    })

    expect(result.carried).toHaveLength(1)
    expect(result.added).toEqual(['Second wording'])
  })

  it('writes the source comment as the extracted comment', () => {
    const result = mergeMessages({
      found: [
        message({
          text: ABOUT,
          references: [REF],
          description: 'Nav item, keep short',
        }),
      ],
      existing: [entry({ source: ABOUT, target: '关于', references: [REF] })],
    })

    expect(result.entries[0]).toMatchObject({
      extracted: 'Nav item, keep short',
    })
  })

  it('removes the extracted comment when the source comment goes away', () => {
    const result = mergeMessages({
      found: [message({ text: ABOUT, references: [REF] })],
      existing: [
        entry({
          source: ABOUT,
          target: '关于',
          references: [REF],
          extracted: 'stale note',
        }),
      ],
    })

    expect(result.entries[0]!.extracted).toBeUndefined()
  })

  it('merges a plural message against its plural pair', () => {
    const result = mergeMessages({
      found: [
        message({
          text: 'One item',
          pluralText: '{n} items',
          references: [REF],
        }),
      ],
      existing: [
        entry({
          source: 'One item',
          pluralSource: '{n} items',
          target: '一件',
          pluralTargets: ['{n} 件'],
          references: [REF],
        }),
      ],
    })

    expect(result.entries[0]).toMatchObject({
      target: '一件',
      pluralTargets: ['{n} 件'],
      fuzzy: false,
    })
  })

  it('counts only clean translations', () => {
    const result = mergeMessages({
      found: [
        message({ text: ABOUT, references: [REF] }),
        message({ text: 'Language', references: ['a.tsx:1'] }),
      ],
      existing: [entry({ source: ABOUT, target: '关于', references: [REF] })],
    })

    expect(result.translated).toBe(1)
  })
})
