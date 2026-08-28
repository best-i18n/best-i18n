import { describe, expect, it } from 'vitest'

import { hashId } from '../src/compiler/id.ts'
import { mergeMessages } from '../src/compiler/merge.ts'

import type { PoEntry } from '../src/compiler/po.ts'

function entry(partial: Partial<PoEntry> & { id: string }): PoEntry {
  return {
    source: '',
    target: '',
    references: [],
    fuzzy: false,
    obsolete: false,
    ...partial,
  }
}

const ABOUT = 'About'
const ABOUT_US = 'About us'
const REF = 'src/routes/about.tsx:15'

describe('mergeMessages', () => {
  it('adds a brand new message with an empty translation', () => {
    const result = mergeMessages({
      found: [{ id: hashId(ABOUT), text: ABOUT, references: [REF] }],
      existing: [],
    })

    expect(result.added).toEqual([hashId(ABOUT)])
    expect(result.entries[0]).toMatchObject({ source: ABOUT, target: '' })
  })

  it('keeps the translation when nothing changed', () => {
    const result = mergeMessages({
      found: [{ id: hashId(ABOUT), text: ABOUT, references: [REF] }],
      existing: [
        entry({
          id: hashId(ABOUT),
          source: ABOUT,
          target: '关于',
          references: [REF],
        }),
      ],
    })

    expect(result.added).toEqual([])
    expect(result.carried).toEqual([])
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.target).toBe('关于')
    expect(result.entries[0]!.fuzzy).toBe(false)
  })

  it('carries the translation across a rewording and marks it fuzzy', () => {
    const result = mergeMessages({
      found: [{ id: hashId(ABOUT_US), text: ABOUT_US, references: [REF] }],
      existing: [
        entry({
          id: hashId(ABOUT),
          source: ABOUT,
          target: '关于',
          references: [REF],
        }),
      ],
    })

    expect(result.added).toEqual([])
    expect(result.carried).toEqual([
      { id: hashId(ABOUT_US), from: ABOUT, to: ABOUT_US },
    ])

    const live = result.entries.filter((item) => !item.obsolete)
    expect(live).toHaveLength(1)
    expect(live[0]).toMatchObject({
      id: hashId(ABOUT_US),
      source: ABOUT_US,
      target: '关于',
      fuzzy: true,
    })
    // The old entry was consumed, not left behind as obsolete.
    expect(result.obsoleted).toEqual([])
  })

  it('does not carry anything when the old entry was untranslated', () => {
    const result = mergeMessages({
      found: [{ id: hashId(ABOUT_US), text: ABOUT_US, references: [REF] }],
      existing: [
        entry({
          id: hashId(ABOUT),
          source: ABOUT,
          target: '',
          references: [REF],
        }),
      ],
    })

    expect(result.carried).toEqual([])
    expect(result.added).toEqual([hashId(ABOUT_US)])
    expect(result.entries.filter((item) => item.obsolete)).toEqual([])
  })

  it('obsoletes a removed message but keeps its translation', () => {
    const result = mergeMessages({
      found: [],
      existing: [
        entry({
          id: hashId(ABOUT),
          source: ABOUT,
          target: '关于',
          references: [REF],
        }),
      ],
    })

    expect(result.obsoleted).toEqual([hashId(ABOUT)])
    expect(result.entries[0]).toMatchObject({
      target: '关于',
      obsolete: true,
      references: [],
    })
  })

  it('drops a removed message that had no translation', () => {
    const result = mergeMessages({
      found: [],
      existing: [entry({ id: hashId(ABOUT), source: ABOUT, target: '' })],
    })

    expect(result.entries).toEqual([])
  })

  it('does not let two new messages both claim one old reference', () => {
    const a = 'First wording'
    const b = 'Second wording'
    const result = mergeMessages({
      found: [
        { id: hashId(a), text: a, references: [REF] },
        { id: hashId(b), text: b, references: [REF] },
      ],
      existing: [
        entry({ id: 'old', source: 'Old', target: '旧', references: [REF] }),
      ],
    })

    expect(result.carried).toHaveLength(1)
    expect(result.added).toEqual([hashId(b)])
  })

  it('counts only clean translations', () => {
    const result = mergeMessages({
      found: [
        { id: hashId(ABOUT), text: ABOUT, references: [REF] },
        { id: hashId('Language'), text: 'Language', references: ['a.tsx:1'] },
      ],
      existing: [
        entry({
          id: hashId(ABOUT),
          source: ABOUT,
          target: '关于',
          references: [REF],
        }),
      ],
    })

    expect(result.translated).toBe(1)
  })
})
