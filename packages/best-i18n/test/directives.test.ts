import { describe, expect, it } from 'vitest'

import { transform } from '../src/compiler/transform.ts'

const MACRO = 'best-i18n/macro'
const HOOK = 'best-i18n/react/macro'

const OPTIONS = {
  locales: ['en', 'zh'],
  baseLocale: 'en',
  catalog: { About: { en: 'About', zh: '关于' } },
}

/** The first statement of the emitted module, directives included. */
function firstStatement(code: string): string {
  return code.split('\n').find((line) => line.trim() !== '') ?? ''
}

describe('injected imports and the directive prologue', () => {
  it('keeps `use client` first when injecting useLocale', () => {
    const code = [
      `'use client'`,
      `import { useI18n } from '${HOOK}'`,
      'function A() { const t = useI18n(); return t`About` }',
    ].join('\n')

    const result = transform(code, 'a.tsx', OPTIONS)!

    // A directive that is no longer the first statement is just a string
    // expression, which would quietly turn this into a server component.
    expect(firstStatement(result.code)).toBe(`'use client'`)
    expect(result.code).toContain(
      'import { useLocale as __i18nUseLocale } from "best-i18n/react"',
    )
  })

  it('keeps `use client` first when injecting getLocale', () => {
    const code = [
      `"use client";`,
      `import { t } from '${MACRO}'`,
      'const title = t`About`',
    ].join('\n')

    const result = transform(code, 'a.ts', OPTIONS)!

    expect(firstStatement(result.code)).toBe(`"use client";`)
    expect(result.code).toContain(
      'import { getLocale as __i18nGetLocale } from "best-i18n/runtime"',
    )
  })

  it('still prepends when the file has no directive', () => {
    const code = [
      `import { t } from '${MACRO}'`,
      'const title = t`About`',
    ].join('\n')

    const result = transform(code, 'a.ts', OPTIONS)!

    expect(firstStatement(result.code)).toContain('__i18nGetLocale')
  })
})
