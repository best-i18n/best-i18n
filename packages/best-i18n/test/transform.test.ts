import { describe, expect, it } from 'vitest'

import { extract, transform } from '../src/compiler/transform.ts'

const MACRO = 'best-i18n/macro'

/** Fixtures need a real macro import: matching is by binding, not by name. */
const src = (code: string) => `import { t } from '${MACRO}'\n${code}`

const OPTIONS = {
  locales: ['en', 'zh'],
  baseLocale: 'en',
  catalog: {
    'A small starter with room to grow.': {
      en: 'A small starter with room to grow.',
      zh: '一个小而可长的起始模板。',
    },
    'Hi {name}, you have {count} items': {
      en: 'Hi {name}, you have {count} items',
      zh: '你好 {name}，你有 {count} 项',
    },
  },
}

describe('extract', () => {
  it('reads the text and the interpolated expressions', () => {
    const messages = extract(
      src('const x = t`Hi ${name}, you have ${count} items`'),
      'a.ts',
    )

    expect(messages).toHaveLength(1)
    expect(messages[0]!.text).toBe('Hi {name}, you have {count} items')
    expect(messages[0]!.expressions).toEqual(['name', 'count'])
  })

  it('ignores other tagged templates', () => {
    expect(extract('const x = css`color: red`', 'a.ts')).toHaveLength(0)
  })

  it('parses JSX when the module id carries a query string', () => {
    // TanStack Router's code splitter appends `?tsr-split=component`.
    const messages = extract(
      src('export const C = () => <p className="x">{t`Hi`}</p>'),
      '/app/about.tsx?tsr-split=component',
    )

    expect(messages.map((message) => message.text)).toEqual(['Hi'])
  })

  it('numbers complex expressions and names identifiers', () => {
    const source = src('const a = t`Hi ${user.name}, you have ${count} items`')

    // `user.name` is not an identifier, so it stays positional; `count` names
    // its own placeholder.
    expect(extract(source, 'a.ts')[0]!.text).toBe(
      'Hi {0}, you have {count} items',
    )

    const result = transform(source, 'a.ts', {
      ...OPTIONS,
      staticLocale: 'zh',
      catalog: {
        'Hi {0}, you have {count} items': {
          zh: '你好 {0}，你有 {count} 项',
        },
      },
    })!

    expect(result.code).toContain('`你好 ${user.name}，你有 ${count} 项`')
  })
})

describe('transform: single build', () => {
  it('emits a ternary chain with no allocation and imports getLocale once', () => {
    const result = transform(
      src('export const a = t`A small starter with room to grow.`'),
      'a.ts',
      OPTIONS,
    )!

    expect(result.code).toContain(
      '(__i18nGetLocale() === "zh" ? `一个小而可长的起始模板。` : `A small starter with room to grow.`)',
    )
    expect(result.code).not.toContain('=>')
    expect(result.code).not.toContain('{en:')
    expect(result.code.match(/getLocale as __i18nGetLocale/g)).toHaveLength(1)
  })

  it('does not collide with an existing getLocale import', () => {
    const code = src(
      [
        "import { getLocale } from 'best-i18n/runtime'",
        'export const a = () => getLocale() + t`About`',
      ].join('\n'),
    )

    const result = transform(code, 'a.ts', {
      ...OPTIONS,
      catalog: { ...OPTIONS.catalog, About: { en: 'About', zh: '关于' } },
    })!

    expect(result.code).toContain('getLocale as __i18nGetLocale')
    expect(result.code).toContain('__i18nGetLocale() === "zh"')
    // The file's own import must survive untouched.
    expect(
      result.code.match(/import \{ getLocale \} from 'best-i18n\/runtime'/g),
    ).toHaveLength(1)
  })

  it('picks a further suffix if the alias is taken too', () => {
    const code = src('const __i18nGetLocale = 1; const a = t`About`')
    const result = transform(code, 'a.ts', {
      ...OPTIONS,
      catalog: { ...OPTIONS.catalog, About: { en: 'About', zh: '关于' } },
    })!

    expect(result.code).toContain('getLocale as __i18nGetLocale2')
    expect(result.code).toContain('__i18nGetLocale2() === "zh"')
  })

  it('emits a bare literal when there is only one locale', () => {
    const result = transform(
      src('const a = t`A small starter with room to grow.`'),
      'a.ts',
      {
        ...OPTIONS,
        locales: ['en'],
      },
    )!

    expect(result.code).not.toContain('getLocale')
    expect(result.code).toContain('`A small starter with room to grow.`')
  })
})

describe('transform: edge cases', () => {
  it('returns null when the file has no messages', () => {
    expect(transform(src('export const a = 1'), 'a.ts', OPTIONS)).toBeNull()
  })

  it('reports a missing translation and falls back to the base locale', () => {
    const result = transform(src('const a = t`Untranslated thing`'), 'a.ts', {
      ...OPTIONS,
      catalog: {
        ...OPTIONS.catalog,
        untranslated_thing: { en: 'Untranslated thing' },
      },
    })!

    expect(result.missing).toEqual([
      { text: 'Untranslated thing', locale: 'zh' },
    ])
    expect(result.code).toContain('`Untranslated thing`')
  })

  it('escapes backticks and ${ in message text', () => {
    const result = transform(src('const a = t`weird`'), 'a.ts', {
      ...OPTIONS,
      staticLocale: 'en',
      catalog: { weird: { en: 'a `tick` and ${notAnExpr}' } },
    })!

    expect(result.code).toContain('\\`tick\\`')
    expect(result.code).toContain('\\${notAnExpr}')
  })

  it('rejects nested t``', () => {
    expect(() =>
      transform(src('const a = t`outer ${t`inner`}`'), 'a.ts', OPTIONS),
    ).toThrow(/nested/)
  })
})
