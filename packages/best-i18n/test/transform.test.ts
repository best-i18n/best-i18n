import { describe, expect, it } from 'vitest'

import { extract, transform } from '../src/compiler/transform.ts'
import { fixture, json } from './helpers/fixture.ts'

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
  it('reads the text and the interpolated expressions', async () => {
    const messages = extract(
      fixture('transform/extract-interpolated/input.ts'),
      'a.ts',
    )

    await expect(json(messages)).toMatchFileSnapshot(
      'fixtures/transform/extract-interpolated/messages.json',
    )
  })

  it('ignores other tagged templates', () => {
    expect(extract('const x = css`color: red`', 'a.ts')).toHaveLength(0)
  })

  it('parses JSX when the module id carries a query string', async () => {
    // TanStack Router's code splitter appends `?tsr-split=component`.
    const messages = extract(
      fixture('transform/extract-jsx-query-string/input.tsx'),
      '/app/about.tsx?tsr-split=component',
    )

    await expect(json(messages)).toMatchFileSnapshot(
      'fixtures/transform/extract-jsx-query-string/messages.json',
    )
  })

  it('numbers complex expressions and names identifiers', async () => {
    const source = fixture('transform/extract-positional/input.ts')

    // `user.name` is not an identifier, so it stays positional; `count` names
    // its own placeholder.
    await expect(json(extract(source, 'a.ts'))).toMatchFileSnapshot(
      'fixtures/transform/extract-positional/messages.json',
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

    await expect(result.code).toMatchFileSnapshot(
      'fixtures/transform/extract-positional/output.ts',
    )
  })
})

describe('transform: single build', () => {
  it('emits a ternary chain with no allocation and imports getLocale once', async () => {
    const result = transform(
      fixture('transform/single-build-ternary/input.ts'),
      'a.ts',
      OPTIONS,
    )!

    // No arrow, no {en: ...} allocation, one getLocale import.
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/transform/single-build-ternary/output.ts',
    )
  })

  it('does not collide with an existing getLocale import', async () => {
    const result = transform(
      fixture('transform/existing-getlocale-import/input.ts'),
      'a.ts',
      {
        ...OPTIONS,
        catalog: { ...OPTIONS.catalog, About: { en: 'About', zh: '关于' } },
      },
    )!

    // The file's own import must survive untouched, next to the alias.
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/transform/existing-getlocale-import/output.ts',
    )
  })

  it('picks a further suffix if the alias is taken too', async () => {
    const result = transform(
      fixture('transform/alias-suffix-taken/input.ts'),
      'a.ts',
      {
        ...OPTIONS,
        catalog: { ...OPTIONS.catalog, About: { en: 'About', zh: '关于' } },
      },
    )!

    await expect(result.code).toMatchFileSnapshot(
      'fixtures/transform/alias-suffix-taken/output.ts',
    )
  })

  it('emits a bare literal when there is only one locale', async () => {
    const result = transform(
      fixture('transform/single-locale-literal/input.ts'),
      'a.ts',
      {
        ...OPTIONS,
        locales: ['en'],
      },
    )!

    await expect(result.code).toMatchFileSnapshot(
      'fixtures/transform/single-locale-literal/output.ts',
    )
  })
})

describe('transform: repeated messages hoist', () => {
  it('emits one function for a message repeated in a module', async () => {
    const result = transform(
      fixture('transform/hoist-repeated/input.ts'),
      'a.ts',
      OPTIONS,
    )!

    // The text pair exists once, in a module-level function taking the
    // locale; both call sites call it, reading the locale at call time.
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/transform/hoist-repeated/output.ts',
    )
  })

  it('parameterizes interpolations so call sites keep their own expressions', async () => {
    const result = transform(
      fixture('transform/hoist-parameterized/input.ts'),
      'a.ts',
      {
        ...OPTIONS,
        catalog: { 'Hi {0}': { en: 'Hi {0}', zh: '你好 {0}' } },
      },
    )!

    await expect(result.code).toMatchFileSnapshot(
      'fixtures/transform/hoist-parameterized/output.ts',
    )
  })

  it('shares one function between hook and non-hook call sites', async () => {
    const result = transform(
      fixture('transform/hoist-hook-and-plain/input.tsx'),
      'a.tsx',
      OPTIONS,
    )!

    // The plain site reads the locale, the hook site passes its variable.
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/transform/hoist-hook-and-plain/output.tsx',
    )
  })

  it('hoists a repeated plural with the count as a parameter', async () => {
    const result = transform(
      fixture('transform/hoist-repeated-plural/input.ts'),
      'a.ts',
      {
        locales: ['en', 'zh'],
        baseLocale: 'en',
        catalog: { 'One item\u0005{0} items': { zh: ['{0} 件'] } },
        plurals: {
          en: { nplurals: 2, formula: 'n != 1' },
          zh: { nplurals: 1, formula: '0' },
        },
      },
    )!

    // One declaration, dispatching on its own parameter; the one-form zh
    // branch is the bare string while en dispatches on e0.
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/transform/hoist-repeated-plural/output.ts',
    )
  })

  it('does not hoist <Trans>, even repeated', async () => {
    const result = transform(
      fixture('transform/no-hoist-trans/input.tsx'),
      'a.tsx',
      {
        locales: ['en', 'zh'],
        baseLocale: 'en',
        catalog: {
          'Read the <a>docs</a>.': { zh: '请阅读<a>docs</a>。' },
        },
      },
    )!

    // Each call site keeps its own JSX branch - the href differs.
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/transform/no-hoist-trans/output.tsx',
    )
  })

  it('picks a further prefix when __i18nM is taken', async () => {
    const result = transform(
      fixture('transform/hoist-prefix-taken/input.ts'),
      'a.ts',
      OPTIONS,
    )!

    await expect(result.code).toMatchFileSnapshot(
      'fixtures/transform/hoist-prefix-taken/output.ts',
    )
  })

  it('does not hoist under staticLocale, where messages are bare literals', async () => {
    const result = transform(
      fixture('transform/no-hoist-static-locale/input.ts'),
      'a.ts',
      { ...OPTIONS, staticLocale: 'zh' },
    )!

    await expect(result.code).toMatchFileSnapshot(
      'fixtures/transform/no-hoist-static-locale/output.ts',
    )
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

  it('escapes backticks and ${ in message text', async () => {
    const result = transform(fixture('transform/escapes/input.ts'), 'a.ts', {
      ...OPTIONS,
      staticLocale: 'en',
      catalog: { weird: { en: 'a `tick` and ${notAnExpr}' } },
    })!

    await expect(result.code).toMatchFileSnapshot(
      'fixtures/transform/escapes/output.ts',
    )
  })

  it('rejects nested t``', () => {
    expect(() =>
      transform(src('const a = t`outer ${t`inner`}`'), 'a.ts', OPTIONS),
    ).toThrow(/nested/)
  })
})
