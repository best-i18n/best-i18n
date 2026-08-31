import { describe, expect, it } from 'vitest'

import { transform } from '../src/compiler/transform.ts'
import { clientModuleError } from '../src/integrations/next/loader.ts'

const OPTIONS = {
  locales: ['en', 'zh'],
  baseLocale: 'en',
  catalog: { About: { en: 'About', zh: '关于' } },
}

function check(code: string, staticLocale?: string) {
  const result = transform(code, 'a.tsx', { ...OPTIONS, staticLocale })!

  return clientModuleError({
    filename: 'a.tsx',
    directives: result.directives,
    messages: result.messages,
    staticLocale,
  })
}

const CLIENT = `'use client'\n`

describe('a message in a Client Component', () => {
  it('is rejected when it has no useI18n() above it', () => {
    const error = check(
      `${CLIENT}import { t } from 'best-i18n/macro'\n` +
        'export function A() { return <p>{t`About`}</p> }',
    )

    expect(error).toMatch(/take its locale from the hook/)
    // The offending message is named, not just the file.
    expect(error).toContain('a.tsx:3  "About"')
  })

  it('rejects a <Trans> with no hook in scope for the same reason', () => {
    const error = check(
      `${CLIENT}import { Trans } from 'best-i18n/react/macro'\n` +
        'export function A() { return <p><Trans>About</Trans></p> }',
    )

    expect(error).toMatch(/take its locale from the hook/)
  })

  it('accepts both once the hook binds them', () => {
    const error = check(
      `${CLIENT}import { Trans, useI18n } from 'best-i18n/react/macro'\n` +
        'export function A() {\n' +
        '  const t = useI18n()\n' +
        '  return <p>{t`About`}<Trans>About</Trans></p>\n' +
        '}',
    )

    expect(error).toBeUndefined()
  })

  it('leaves a Server Component alone', () => {
    const error = check(
      `import { t } from 'best-i18n/macro'\n` +
        'export function A() { return <p>{t`About`}</p> }',
    )

    expect(error).toBeUndefined()
  })

  it('says nothing in a per-locale build, where there is no locale to read', () => {
    const error = check(
      `${CLIENT}import { t } from 'best-i18n/macro'\n` +
        'export function A() { return <p>{t`About`}</p> }',
      'zh',
    )

    expect(error).toBeUndefined()
  })
})
