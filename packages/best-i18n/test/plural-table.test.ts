import { describe, expect, it } from 'vitest'
import {
  BUILTIN,
  checkFormula,
  parsePluralForms,
  pluralRuleFor,
} from '../src/compiler/plural.ts'
import OFFICIAL from './fixtures/gettext-plurals.json' with { type: 'json' }

/**
 * The reference table every gettext tool ships: 216 languages, each with the
 * `Plural-Forms` formula and form count that GNU gettext and CLDR agree on.
 * Borrowed from Lingui's `@lingui/format-po-gettext` (MIT), which derives it
 * from CLDR - the same data `msginit` writes into a fresh `.po`.
 *
 * It is worth having as a fixture for two reasons. It is the real corpus of
 * formulas `parsePluralForms` has to accept from the wild, and it is the only
 * independent check on the builtin table: a hand-written formula that is
 * subtly wrong for Latvian looks perfectly plausible in review and picks the
 * wrong `msgstr[n]` forever.
 */
const table = OFFICIAL as Record<
  string,
  { nplurals: number; formula: string; cases: string[] }
>

/** Compiles a formula the way the transform inlines it, to compare behaviour. */
const select = (formula: string) =>
  // oxlint-disable-next-line no-new-func -- gettext formulas arrive as strings; this is how the transform inlines them
  new Function('n', `return Number(${formula})`) as (n: number) => number

/** Counts up to a million, so the CLDR `many` form has a chance to appear. */
const COUNTS = [
  ...Array.from({ length: 2001 }, (_, n) => n),
  10_000,
  100_000,
  1_000_000,
  2_000_000,
  1_000_001,
]

describe('the reference table is inside the formula grammar', () => {
  // Every real-world formula has to survive `checkFormula`, or a translator
  // whose locale is not in the builtin table cannot ship a plural at all.
  it.each(Object.keys(table))('%s', (language) => {
    const { formula } = table[language]!
    expect(checkFormula(formula)).toBe(formula.trim())
  })

  it.each(Object.entries(table))(
    'parses %s as a Plural-Forms header',
    (_language, rule) => {
      const header = `nplurals=${rule.nplurals}; plural=${rule.formula};`
      expect(parsePluralForms(header)).toEqual({
        nplurals: rule.nplurals,
        formula: rule.formula,
      })
    },
  )

  it('never selects a form the header does not declare', () => {
    // The emitted dispatch chain has `nplurals` branches. A formula that can
    // return an out-of-range index would fall off the end of it.
    //
    // Collected rather than asserted per count: 216 languages over every
    // count below is a third of a million checks, and `expect` in that loop
    // costs more than the whole rest of the suite.
    const violations: string[] = []

    for (const [language, rule] of Object.entries(table)) {
      const form = select(rule.formula)
      for (const n of COUNTS) {
        const index = form(n)
        if (Number.isInteger(index) && index >= 0 && index < rule.nplurals) {
          continue
        }
        violations.push(
          `${language} selected form ${index} of ${rule.nplurals} for n=${n}`,
        )
        break
      }
    }

    expect(violations).toEqual([])
  })
})

/**
 * Departures from the reference table, each one deliberate.
 *
 * Everything else has to agree, and agreement is measured by behaviour rather
 * than by spelling: the builtin formulas are written more compactly than
 * CLDR's, so `ru` reads `n%100<10 || n%100>=20` against CLDR's `n%100<12 ||
 * n%100>14` and selects the same form for every count.
 */
const DEPARTURES: Record<string, string> = {
  // CLDR added a `many` form for the millions - "1 million de personnes" -
  // which classic gettext catalogs for these languages do not have. Adopting
  // it would demand a third `msgstr[2]` from every existing translation and
  // silently stop shipping the ones that only have two.
  es: 'no CLDR `many` form',
  it: 'no CLDR `many` form',
  ca: 'no CLDR `many` form',
  fr: 'no CLDR `many` form',
  pt: 'no CLDR `many` form',
  // Occitan is not in the CLDR-derived table at all; GNU gettext's own list
  // has it alongside French.
  oc: 'not in the reference table',
}

describe('the builtin table agrees with the reference table', () => {
  const languages = [...BUILTIN.keys()].filter(
    (language) => DEPARTURES[language] === undefined,
  )

  it.each(languages)('%s', (language) => {
    const official = table[language]
    expect(official, `${language} is not in the reference table`).toBeDefined()

    const ours = pluralRuleFor(language, undefined)
    expect(ours.nplurals).toBe(official!.nplurals)

    const mine = select(ours.formula)
    const theirs = select(official!.formula)
    const disagree = COUNTS.filter((n) => mine(n) !== theirs(n))

    expect(
      disagree,
      `${language}: "${ours.formula}" against "${official!.formula}"`,
    ).toEqual([])
  })

  it.each(Object.entries(DEPARTURES))(
    '%s departs on purpose: %s',
    (language) => {
      // Pinned so a departure cannot quietly become an accident: if these
      // ever match the reference table, delete the exemption.
      const official = table[language]
      if (official === undefined) return

      const ours = pluralRuleFor(language, undefined)
      expect(ours.nplurals).not.toBe(official.nplurals)
    },
  )
})
