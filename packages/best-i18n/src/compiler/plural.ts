/**
 * gettext plural rules.
 *
 * A locale's `Plural-Forms` header carries a C expression - `nplurals=3;
 * plural=(n%10==1 && n%100!=11 ? 0 : ...)` - that maps a count to a form
 * index. The expression grammar is a strict subset of JavaScript, which is
 * the whole trick: instead of shipping an ICU runtime or `Intl.PluralRules`
 * plus a category-to-index map, the compiler inlines the formula itself, so a
 * plural message costs one arrow function and nothing else.
 */

export interface PluralRule {
  nplurals: number
  /** JS expression over `n`, evaluating to the form index (or a boolean). */
  formula: string
}

/** Germanic: what GNU gettext falls back to for untranslated plurals. */
export const GERMANIC: PluralRule = { nplurals: 2, formula: 'n != 1' }

/**
 * Built-in rules by primary language subtag, used when a catalog has no
 * `Plural-Forms` header. The header always wins - it is the translator's
 * statement of intent, and covers the locales this table does not.
 *
 * Every entry is checked against the table GNU gettext and CLDR agree on by
 * `plural-table.test.ts`, which compares behaviour rather than spelling: the
 * formulas here are written differently but must select the same form for
 * every count. The few deliberate departures are listed there with a reason.
 */
export const BUILTIN = new Map<string, PluralRule>([
  // One form.
  ...['ja', 'zh', 'ko', 'vi', 'th', 'id', 'ms', 'my', 'km'].map(
    (tag): [string, PluralRule] => [tag, { nplurals: 1, formula: '0' }],
  ),
  // Singular only at exactly one.
  ...[
    'en',
    'de',
    'nl',
    'sv',
    'da',
    'no',
    'nb',
    'nn',
    'fi',
    'et',
    'el',
    'es',
    'it',
    'ca',
    'eu',
    'gl',
    'bg',
    'hu',
    'sq',
    'eo',
    'ur',
    'tr',
    'az',
    'kk',
    'ky',
    'uz',
    'ta',
    'te',
    'ml',
    'mr',
    'ne',
    'sw',
  ].map((tag): [string, PluralRule] => [tag, GERMANIC]),
  // Singular at zero and one.
  ...['fr', 'oc', 'hy', 'fa', 'pt', 'hi', 'bn'].map(
    (tag): [string, PluralRule] => [tag, { nplurals: 2, formula: 'n > 1' }],
  ),
  // Hebrew has a dual: one, two, other.
  ['he', { nplurals: 3, formula: 'n==1 ? 0 : n==2 ? 1 : 2' }],
  // East Slavic / Serbo-Croatian three-way.
  ...['ru', 'uk', 'be', 'sr', 'hr', 'bs'].map((tag): [string, PluralRule] => [
    tag,
    {
      nplurals: 3,
      formula:
        'n%10==1 && n%100!=11 ? 0 : ' +
        'n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2',
    },
  ]),
  [
    'pl',
    {
      nplurals: 3,
      formula:
        'n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2',
    },
  ],
  ...['cs', 'sk'].map((tag): [string, PluralRule] => [
    tag,
    { nplurals: 3, formula: 'n==1 ? 0 : n>=2 && n<=4 ? 1 : 2' },
  ]),
  [
    'ro',
    {
      nplurals: 3,
      formula: 'n==1 ? 0 : n==0 || (n%100 > 0 && n%100 < 20) ? 1 : 2',
    },
  ],
  [
    'lt',
    {
      nplurals: 3,
      formula:
        'n%10==1 && n%100!=11 ? 0 : n%10>=2 && (n%100<10 || n%100>=20) ? 1 : 2',
    },
  ],
  [
    'lv',
    {
      nplurals: 3,
      formula:
        'n%10==0 || (n%100>=11 && n%100<=19) ? 0 : ' +
        'n%10==1 && n%100!=11 ? 1 : 2',
    },
  ],
  [
    'sl',
    {
      nplurals: 4,
      formula: 'n%100==1 ? 0 : n%100==2 ? 1 : n%100==3 || n%100==4 ? 2 : 3',
    },
  ],
  [
    'ar',
    {
      nplurals: 6,
      formula:
        'n==0 ? 0 : n==1 ? 1 : n==2 ? 2 : n%100>=3 && n%100<=10 ? 3 : ' +
        'n%100>=11 ? 4 : 5',
    },
  ],
])

/**
 * The characters a plural formula may contain: `n`, integers, arithmetic,
 * comparisons, boolean operators, ternaries, parentheses.
 *
 * The formula ends up inlined in emitted JavaScript, so anything outside this
 * grammar is rejected loudly - a `.po` file is developer-controlled input,
 * but "developer-controlled" and "worth trusting into eval position" are
 * different bars.
 */
const FORMULA = /^[\sn0-9()%!<>=&|?:+\-*/]+$/

function balanced(expression: string): boolean {
  let depth = 0
  for (const char of expression) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (depth < 0) return false
  }
  return depth === 0
}

/** Validates and normalizes a formula, or explains why it cannot be used. */
export function checkFormula(formula: string): string {
  const trimmed = formula.trim()

  if (trimmed === '') {
    throw new Error('best-i18n: empty plural formula')
  }
  if (!FORMULA.test(trimmed) || !balanced(trimmed)) {
    throw new Error(
      `best-i18n: unsupported plural formula "${trimmed}" - only the C ` +
        'expression grammar gettext uses (n, integers, ?:, comparisons, ' +
        '%, &&, ||) is accepted.',
    )
  }

  return trimmed
}

/**
 * Parses a `Plural-Forms` header value, e.g.
 * `nplurals=2; plural=(n != 1);`
 */
export function parsePluralForms(header: string): PluralRule {
  const match = /nplurals\s*=\s*(\d+)\s*;\s*plural\s*=\s*(.+?);?\s*$/.exec(
    header,
  )

  if (match === null) {
    throw new Error(
      `best-i18n: cannot parse Plural-Forms header "${header}" - expected ` +
        '"nplurals=N; plural=EXPRESSION;".',
    )
  }

  const nplurals = Number(match[1])
  if (!Number.isInteger(nplurals) || nplurals < 1 || nplurals > 6) {
    throw new Error(
      `best-i18n: implausible nplurals=${match[1]} in Plural-Forms header.`,
    )
  }

  return { nplurals, formula: checkFormula(match[2]!) }
}

/**
 * The rule for a locale: its catalog's `Plural-Forms` header when present,
 * the built-in table for its primary subtag otherwise, Germanic as the last
 * resort - which is also GNU gettext's fallback for untranslated messages.
 */
export function pluralRuleFor(
  locale: string,
  header: string | undefined,
): PluralRule {
  if (header !== undefined && header.trim() !== '') {
    return parsePluralForms(header)
  }

  const primary = locale.toLowerCase().split(/[-_]/)[0] ?? locale
  return BUILTIN.get(primary) ?? GERMANIC
}
