import { describe, expect, it } from 'vitest'

import {
  checkFormula,
  parsePluralForms,
  pluralRuleFor,
} from '../src/compiler/plural.ts'
import { extract, transform } from '../src/compiler/transform.ts'

const MACRO = 'best-i18n/macro'
const REACT = 'best-i18n/react/macro'

const src = (code: string) => `import { plural } from '${MACRO}'\n${code}`

const RU = {
  nplurals: 3,
  formula:
    'n%10==1 && n%100!=11 ? 0 : ' +
    'n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2',
}

const OPTIONS = {
  locales: ['en', 'zh'],
  baseLocale: 'en',
  catalog: {
    'One item{n} items': { zh: ['{n} 件'] },
  },
  plurals: {
    en: { nplurals: 2, formula: 'n != 1' },
    zh: { nplurals: 1, formula: '0' },
  },
}

describe('plural rules', () => {
  it('parses a Plural-Forms header', () => {
    expect(parsePluralForms('nplurals=2; plural=(n != 1);')).toEqual({
      nplurals: 2,
      formula: '(n != 1)',
    })
  })

  it('rejects a formula outside the gettext grammar', () => {
    expect(() => checkFormula('n != 1; alert(1)')).toThrow(/unsupported/)
    expect(() => checkFormula('require("fs")')).toThrow(/unsupported/)
    expect(() => checkFormula('(n))(')).toThrow(/unsupported/)
  })

  it('falls back to the builtin table, then Germanic', () => {
    expect(pluralRuleFor('zh-CN', undefined).nplurals).toBe(1)
    expect(pluralRuleFor('ru', undefined).nplurals).toBe(3)
    expect(pluralRuleFor('xx', undefined)).toEqual({
      nplurals: 2,
      formula: 'n != 1',
    })
    // The header always wins over the table.
    expect(pluralRuleFor('zh', 'nplurals=2; plural=(n > 1);').nplurals).toBe(2)
  })
})

describe('plural macro', () => {
  it('extracts the pair with the count as a named placeholder', () => {
    const messages = extract(
      src('const a = plural(n, `One item`, `${n} items`)'),
      'a.ts',
    )

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      text: 'One item',
      plural: { count: 'n', other: '{n} items' },
      placeholders: ['n'],
    })
  })

  it('registers an uninterpolated count so translations can use it', () => {
    const messages = extract(
      src('const a = plural(count, `an item`, `items`)'),
      'a.ts',
    )

    expect(messages[0]!.placeholders).toEqual(['count'])
  })

  it('inlines each locale formula and dispatches on the count', () => {
    const result = transform(
      src('export const a = plural(n, `One item`, `${n} items`)'),
      'a.ts',
      OPTIONS,
    )!

    // zh has one form: no dispatch at all, just the string.
    expect(result.code).toContain('`${n} 件`')
    // en (base) dispatches on the Germanic formula.
    expect(result.code).toContain('__i18nN != 1')
    expect(result.code).toContain('`One item`')
    expect(result.code).toContain('`${n} items`')
  })

  it('collapses to one locale in a per-locale build', () => {
    const zh = transform(
      src('export const a = plural(n, `One item`, `${n} items`)'),
      'a.ts',
      { ...OPTIONS, staticLocale: 'zh' },
    )!

    expect(zh.code).toContain('`${n} 件`')
    expect(zh.code).not.toContain('One item')
    expect(zh.code).not.toContain('__i18nN')
  })

  it('emits a three-form chain for a three-form locale', () => {
    const result = transform(
      src('export const a = plural(n, `One item`, `${n} items`)'),
      'a.ts',
      {
        locales: ['en', 'ru'],
        baseLocale: 'en',
        catalog: {
          'One item{n} items': {
            ru: ['{n} предмет', '{n} предмета', '{n} предметов'],
          },
        },
        plurals: { en: { nplurals: 2, formula: 'n != 1' }, ru: RU },
      },
    )!

    expect(result.code).toContain('__i18nI === 1 ? `${n} предмета`')
    expect(result.code).toContain('__i18nI === 2 ? `${n} предметов`')
    expect(result.code).toContain('`${n} предмет`')
  })

  it('the emitted dispatch actually selects the right form', () => {
    const result = transform(
      src('export const pick = (n) => plural(n, `One item`, `${n} items`)'),
      'a.ts',
      {
        ...OPTIONS,
        staticLocale: 'en',
      },
    )!

    const body = result.code.replace(`import { plural } from '${MACRO}'`, '')
    // eslint-disable-next-line no-eval
    const pick = eval(`${body.replace('export const pick =', '(')})`)
    expect(pick(1)).toBe('One item')
    expect(pick(0)).toBe('0 items')
    expect(pick(5)).toBe('5 items')
  })

  it('falls back to the source forms and reports missing', () => {
    const result = transform(
      src('export const a = plural(n, `One item`, `${n} items`)'),
      'a.ts',
      { ...OPTIONS, catalog: {} },
    )!

    expect(result.missing).toEqual([{ text: 'One item', locale: 'zh' }])
    expect(result.code).toContain('`One item`')
  })

  it('treats a form count that disagrees with nplurals as missing', () => {
    const result = transform(
      src('export const a = plural(n, `One item`, `${n} items`)'),
      'a.ts',
      {
        ...OPTIONS,
        // zh declares one form; two supplied means the entry is not usable.
        catalog: { 'One item{n} items': { zh: ['一件', '{n} 件'] } },
      },
    )!

    expect(result.missing).toEqual([{ text: 'One item', locale: 'zh' }])
  })

  it('allows a form to drop the count but not to invent a placeholder', () => {
    const ok = transform(
      src('export const a = plural(n, `One item`, `${n} items`)'),
      'a.ts',
      { ...OPTIONS, catalog: { 'One item{n} items': { zh: ['一件'] } } },
    )!
    expect(ok.code).toContain('`一件`')

    expect(() =>
      transform(
        src('export const a = plural(n, `One item`, `${n} items`)'),
        'a.ts',
        {
          ...OPTIONS,
          catalog: { 'One item{n} items': { zh: ['{wrong} 件'] } },
        },
      ),
    ).toThrow(/uses \{wrong\}/)
  })

  it('dispatches on the hook variable inside a component', () => {
    const code = [
      `import { plural } from '${MACRO}'`,
      `import { useI18n } from '${REACT}'`,
      'function A({ n }) {',
      '  const t = useI18n()',
      '  return <p>{t`Hi`}{plural(n, `One item`, `${n} items`)}</p>',
      '}',
    ].join('\n')

    const result = transform(code, 'a.tsx', {
      ...OPTIONS,
      catalog: { ...OPTIONS.catalog, Hi: { zh: '嗨' } },
    })!

    // The plural reads the hook variable, like <Trans> does - reactive, and
    // client-safe on Next.
    expect(result.code).toContain('t === "zh" ? `${n} 件`')
    expect(result.code).not.toContain('getLocale')
  })

  it('rejects a dynamic form', () => {
    expect(() =>
      transform(src('const a = plural(n, one, other)'), 'a.ts', OPTIONS),
    ).toThrow(/statically visible/)
  })

  it('rejects passing the macro around', () => {
    expect(() => transform(src('const p = plural'), 'a.ts', OPTIONS)).toThrow(
      /call site/,
    )
  })

  it('rejects a plural nested inside a <Trans>', () => {
    const code = [
      `import { plural } from '${MACRO}'`,
      `import { Trans } from '${REACT}'`,
      'export const a = <p><Trans>You have {plural(n, `one`, `many`)}</Trans></p>',
    ].join('\n')

    expect(() => transform(code, 'a.tsx', OPTIONS)).toThrow(/nested messages/)
  })
})
