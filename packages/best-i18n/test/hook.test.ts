import { describe, expect, it } from 'vitest'

import { extract, transform } from '../src/compiler/transform.ts'

const REACT = 'best-i18n/react/macro'

const OPTIONS = {
  locales: ['en', 'zh'],
  baseLocale: 'en',
  catalog: {
    'About': { en: 'About', zh: '关于' },
    'Hi {0}': { en: 'Hi {0}', zh: '你好 {0}' },
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
    const code = [
      `import { useI18n } from '${REACT}'`,
      'function A() { const t = useI18n(); return t`About` }',
      'function B() { const t = useI18n(); return t`Hi ${name}` }',
    ].join('\n')

    const result = transform(code, 'a.tsx', OPTIONS)!

    expect(result.code.match(/__i18nUseLocale\(\)/g)).toHaveLength(2)
    expect(result.code).toContain(
      '(t === "zh" ? `你好 ${name}` : `Hi ${name}`)',
    )
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
    ).toThrow(/only be used as a tagged template/)
  })

  it('rejects passing useI18n itself around', () => {
    expect(() =>
      transform(
        `import { useI18n } from '${REACT}'\nfoo(useI18n)`,
        'a.tsx',
        OPTIONS,
      ),
    ).toThrow(/only be used as a tagged template/)
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
