import { describe, expect, it } from 'vitest'

import { extract, transform } from '../src/compiler/transform.ts'

const REACT = 'best-i18n/react/macro'

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

  it('rejects destructuring the hook result', () => {
    expect(() =>
      transform(
        `import { useI18n } from '${REACT}'\nconst { t } = useI18n()`,
        'a.tsx',
        OPTIONS,
      ),
    ).toThrow(/plain variable/)
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
