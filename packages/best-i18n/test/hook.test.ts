import { describe, expect, it } from 'vitest'
import { extract, transform } from '../src/compiler/transform.ts'
import { fixture } from './helpers/fixture.ts'

const REACT = 'best-i18n/react/macro'
const MACRO = 'best-i18n/macro'

const OPTIONS = {
  locales: ['en', 'zh'],
  baseLocale: 'en',
  catalog: {
    'About': { en: 'About', zh: '关于' },
    'Hi {name}': { en: 'Hi {name}', zh: '你好 {name}' },
  },
}

function component(body: string) {
  return `import { useI18n } from '${REACT}'\nfunction A() { ${body} }`
}

/** Compiles a fixture case's input. */
function compile(name: string, staticLocale?: string) {
  return transform(fixture(`hook/${name}/input.tsx`), 'a.tsx', {
    ...OPTIONS,
    staticLocale,
  })!
}

/** The error a fixture case's input raises, for snapshotting the wording. */
function errorFor(name: string): string {
  try {
    compile(name)
  } catch (error) {
    return `${(error as Error).message}\n`
  }
  throw new Error(`hook/${name} was expected to fail`)
}

describe('useI18n hook macro', () => {
  it('rewrites the declaration to useLocale and compares the variable', () => {
    const result = transform(
      component('const t = useI18n(); return t`About`'),
      'a.tsx',
      OPTIONS,
    )!

    expect(result.code).toContain(
      'import { useLocale as __i18nUseLocale } from "best-i18n/react"',
    )
    expect(result.code).toContain('const t = __i18nUseLocale()')
    expect(result.code).toContain('(t === "zh" ? `关于` : `About`)')
    // No getLocale import: the hook variable is the locale source.
    expect(result.code).not.toContain('getLocale')
  })

  it('keeps each component on its own hook variable', () => {
    // Distinct names on purpose: identical names would pass even if scoping
    // were broken, which is exactly the bug this test exists to catch.
    const code = [
      `import { useI18n } from '${REACT}'`,
      'function A() { const ta = useI18n(); return ta`About` }',
      'function B() { const tb = useI18n(); return tb`Hi ${name}` }',
    ].join('\n')

    const result = transform(code, 'a.tsx', OPTIONS)!

    expect(result.code.match(/__i18nUseLocale\(\)/g)).toHaveLength(2)
    expect(result.code).toContain('(ta === "zh" ? `关于` : `About`)')
    expect(result.code).toContain(
      '(tb === "zh" ? `你好 ${name}` : `Hi ${name}`)',
    )
  })

  it('does not compile an imported macro against a same-named hook variable', () => {
    // A's `t` is the hook variable; B's `t` is the imported macro. Compiling
    // B's message against the hook variable would emit `t === "zh"` where `t`
    // is a function - always false, base locale in every language, silently.
    const code = [
      `import { t } from 'best-i18n/macro'`,
      `import { useI18n } from '${REACT}'`,
      'function A() { const t = useI18n(); return t`About` }',
      'function B() { return t`Hi ${name}` }',
    ].join('\n')

    const result = transform(code, 'a.tsx', OPTIONS)!

    // A reads its hook variable; B falls back to getLocale().
    expect(result.code).toContain('(t === "zh" ? `关于` : `About`)')
    expect(result.code).toContain(
      '(__i18nGetLocale() === "zh" ? `你好 ${name}` : `Hi ${name}`)',
    )
  })

  it('leaves an unrelated same-named variable in another function alone', () => {
    const code = [
      `import { useI18n } from '${REACT}'`,
      'function A() { const t = useI18n(); return t`About` }',
      'function B() { const t = other(); return t.title }',
    ].join('\n')

    const result = transform(code, 'a.tsx', OPTIONS)!

    expect(result.code).toContain('return t.title')
  })

  it('still rejects shadowing inside the declaring component', () => {
    expect(() =>
      transform(
        component('const t = useI18n(); const inner = () => { foo(t) }'),
        'a.tsx',
        OPTIONS,
      ),
    ).toThrow(/only be used at its call site/)
  })

  it('supports a module-level hook variable', () => {
    // Invalid React, but the transform should stay consistent: a hook variable
    // declared outside any function is visible to the whole module.
    const result = transform(
      `import { useI18n } from '${REACT}'\nconst t = useI18n()\nexport const a = t\`About\``,
      'a.tsx',
      OPTIONS,
    )!

    expect(result.code).toContain('(t === "zh" ? `关于` : `About`)')
  })

  it('collapses to the literal locale in a per-locale build', () => {
    const result = transform(
      component('const t = useI18n(); return t`About`'),
      'a.tsx',
      { ...OPTIONS, staticLocale: 'zh' },
    )!

    expect(result.code).toContain('const t = "zh"')
    expect(result.code).toContain('return `关于`')
    expect(result.code).not.toContain('useLocale')
    expect(result.code).not.toContain('About')
  })

  it('respects an aliased hook import', () => {
    const result = transform(
      `import { useI18n as useMessages } from '${REACT}'\n` +
        'function A() { const t = useMessages(); return t`About` }',
      'a.tsx',
      OPTIONS,
    )!

    expect(result.code).toContain('const t = __i18nUseLocale()')
    expect(result.code).toContain('(t === "zh"')
  })

  it('extracts hook messages for the catalogs', () => {
    const messages = extract(
      component('const t = useI18n(); return t`About`'),
      'a.tsx',
    )

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ text: 'About', localeVar: 't' })
  })

  describe('sharing one locale read', () => {
    // useLocale is a useContext plus a useSyncExternalStore, so a component
    // that reads the locale itself and also holds messages would otherwise
    // take two subscriptions for one value.
    const both = (body: string[]) =>
      [
        `import { useI18n } from '${REACT}'`,
        `import { useLocale } from 'best-i18n/react'`,
        'export function C() {',
        ...body,
        '  return <p lang={locale}>{t`About`}</p>',
        '}',
      ].join('\n')

    /** Every call that subscribes to the locale, injected or hand-written. */
    const reads = (code: string) =>
      (code.match(/[uU]seLocale\(\)/g) ?? []).length

    it('aliases a later useLocale() to the hook variable', async () => {
      // The module's own `useLocale` import goes unused in this direction -
      // visible in the fixture, and tree-shaken by any bundler.
      const result = compile('share-read-macro-first')

      expect(reads(result.code)).toBe(1)
      await expect(result.code).toMatchFileSnapshot(
        'fixtures/hook/share-read-macro-first/output.tsx',
      )
    })

    it('aliases the hook to a useLocale() that came first', async () => {
      const result = compile('share-read-read-first')

      // Source order decides, because an alias has to name a variable that is
      // already declared. Here nothing is injected at all.
      expect(result.code).not.toContain('__i18nUseLocale')
      expect(reads(result.code)).toBe(1)
      await expect(result.code).toMatchFileSnapshot(
        'fixtures/hook/share-read-read-first/output.tsx',
      )
    })

    it('leaves a hand-written read alone in a per-locale build', async () => {
      const result = compile('share-read-static', 'zh')

      // The hook is a literal here, so there is no subscription to save, and
      // folding someone's own runtime call to a constant is a bigger claim.
      await expect(result.code).toMatchFileSnapshot(
        'fixtures/hook/share-read-static/output.tsx',
      )
    })

    it('is what makes the recommended dependency free', () => {
      // The macro is refused in a dependency array, so `useLocale()` is the
      // answer there - and aliasing means asking for it costs no second
      // subscription, which is what makes that advice cheap to follow.
      const result = transform(
        [
          `import { useI18n } from '${REACT}'`,
          `import { useLocale } from 'best-i18n/react'`,
          `import { useMemo } from 'react'`,
          'export function C() {',
          '  const locale = useLocale()',
          '  const t = useI18n()',
          '  return useMemo(() => t`About`, [locale])',
          '}',
        ].join('\n'),
        'a.tsx',
        OPTIONS,
      )!

      expect(result.code).toContain('[locale]')
      expect(reads(result.code)).toBe(1)
    })

    it.each([
      [
        'a read in a nested closure',
        [
          '  const t = useI18n()',
          '  const f = () => { const inner = useLocale(); return inner }',
          '  const locale = f()',
        ],
      ],
      [
        'a reassignable binding',
        ['  let locale = useLocale()', '  const t = useI18n()'],
      ],
    ])('does not alias %s', (_name, body) => {
      const result = transform(both(body), 'a.tsx', OPTIONS)!

      expect(reads(result.code)).toBe(2)
    })

    it('follows a custom reactModule', () => {
      // analyze names the options it forwards, so a custom spelling has to be
      // in that list or the dedupe silently stops firing.
      const result = transform(
        [
          `import { useI18n } from '${REACT}'`,
          `import { useLocale } from '@acme/i18n-react'`,
          'export function C() {',
          '  const locale = useLocale()',
          '  const t = useI18n()',
          '  return <p lang={locale}>{t`About`}</p>',
          '}',
        ].join('\n'),
        'a.tsx',
        { ...OPTIONS, reactModule: '@acme/i18n-react' },
      )!

      expect(result.code).toContain('const t = locale')
      expect(reads(result.code)).toBe(1)
    })

    it('does not alias a useLocale from another library', () => {
      const result = transform(
        [
          `import { useI18n } from '${REACT}'`,
          `import { useLocale } from 'other-lib'`,
          'export function C() {',
          '  const locale = useLocale()',
          '  const t = useI18n()',
          '  return <p lang={locale}>{t`About`}</p>',
          '}',
        ].join('\n'),
        'a.tsx',
        OPTIONS,
      )!

      // Matching is by binding, not by name - the same rule the macros use.
      expect(result.code).toContain('const t = __i18nUseLocale()')
      expect(result.code).toContain('const locale = useLocale()')
    })

    it('gives each component its own read', () => {
      const result = transform(
        [
          `import { useI18n } from '${REACT}'`,
          `import { useLocale } from 'best-i18n/react'`,
          'export function A() { const t = useI18n(); return t`About` }',
          'export function B() { const l = useLocale(); return <i lang={l} /> }',
        ].join('\n'),
        'a.tsx',
        OPTIONS,
      )!

      expect(reads(result.code)).toBe(2)
    })
  })

  it('rejects destructuring the hook result', () => {
    expect(() =>
      transform(
        `import { useI18n } from '${REACT}'\nconst { t } = useI18n()`,
        'a.tsx',
        OPTIONS,
      ),
    ).toThrow(/plain variable/)
  })

  describe('a React dependency array', () => {
    // A macro never leaves its call site, and this is no exception - even
    // though the compiled variable would be a valid string dependency. The
    // spelling that works is `useLocale()`, which says what it means, and
    // the dedupe below makes it cost nothing.
    const withDeps = (body: string) =>
      [
        `import { useI18n } from '${REACT}'`,
        `import { useCallback, useEffect, useMemo } from 'react'`,
        'export function C({ n }) {',
        '  const t = useI18n()',
        body,
        '}',
      ].join('\n')

    it.each([
      ['useMemo', '  const a = useMemo(() => t`About`, [t])'],
      ['useCallback', '  const a = useCallback(() => t`About`, [t])'],
      ['useEffect', '  useEffect(() => { document.title = t`About` }, [t])'],
      ['React.useMemo', '  const a = React.useMemo(() => t`About`, [t])'],
      ['among other deps', '  const a = useMemo(() => t`About`, [n, t])'],
      ['a custom hook', '  const a = useDebounce(() => t`About`, [t], 300)'],
    ])('rejects the hook variable in %s', (_name, body) => {
      expect(() => transform(withDeps(body), 'a.tsx', OPTIONS)).toThrow(
        /only be used at its call site/,
      )
    })

    it('names the spelling that works, and the trap next to it', async () => {
      // Checked in, because this wording is the whole answer someone gets:
      // what to write instead, and why `[]` is not it.
      await expect(errorFor('dep-array-macro')).toMatchFileSnapshot(
        'fixtures/hook/dep-array-macro/error.txt',
      )
    })

    it('gives a custom hook the same advice', () => {
      // No list of hook names to keep, so there is nothing to configure and
      // nothing that can be missing from it.
      expect(() =>
        transform(
          withDeps('  const a = useDebounce(() => t`About`, [t], 300)'),
          'a.tsx',
          OPTIONS,
        ),
      ).toThrow(/read it with `useLocale\(\)` and depend on that variable/)
    })

    it('does not advise useLocale() for an imported macro', () => {
      // Module scope, so there is no component to read the locale in and the
      // advice would be nonsense. `hookScopeAt` is what tells the two apart.
      expect(() =>
        transform(
          [
            `import { t } from '${MACRO}'`,
            `import { useMemo } from 'react'`,
            'export const a = useMemo(() => t`About`, [t])',
          ].join('\n'),
          'a.tsx',
          OPTIONS,
        ),
      ).toThrow(/cannot be stored, passed, or shadowed/)
    })

    it('says nothing about dependencies for an ordinary misuse', () => {
      expect(() => transform(withDeps('  foo(t)'), 'a.tsx', OPTIONS)).toThrow(
        /cannot be stored, passed, or shadowed/,
      )
    })

    it('compiles the spelling it recommends', async () => {
      const result = compile('dep-array-locale')

      // One subscription, and the dependency is the very value the compiled
      // message compares - so the memo recomputes on a locale switch.
      expect(result.code).not.toContain('__i18nUseLocale')
      await expect(result.code).toMatchFileSnapshot(
        'fixtures/hook/dep-array-locale/output.tsx',
      )
    })
  })

  it('rejects passing the hook-bound variable around', () => {
    expect(() =>
      transform(component('const t = useI18n(); foo(t)'), 'a.tsx', OPTIONS),
    ).toThrow(/only be used at its call site/)
  })

  it('rejects passing useI18n itself around', () => {
    expect(() =>
      transform(
        `import { useI18n } from '${REACT}'\nfoo(useI18n)`,
        'a.tsx',
        OPTIONS,
      ),
    ).toThrow(/only be used at its call site/)
  })

  it('leaves an unrelated useI18n from another library alone', () => {
    const result = transform(
      "import { useI18n } from 'other-lib'\nconst t = useI18n()\nconst a = t`About`",
      'a.tsx',
      OPTIONS,
    )

    expect(result).toBeNull()
  })
})
