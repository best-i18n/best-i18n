import { t } from 'best-i18n/macro'

import { Counter } from '@/components/counter'
import { localeAlternates } from '@/seo'

import type { Metadata } from 'next'

/**
 * `t` needs no setup here either. `generateMetadata` runs inside the same
 * render as the page, so the locale is already resolved - which also means the
 * title is compiled away per locale exactly like the body copy is.
 */
export function generateMetadata(): Metadata {
  return {
    title: t`best-i18n - compile-time internationalization`,
    description: t`Translations inlined at the call site, with no runtime catalog and nothing to load.`,
    alternates: localeAlternates('/'),
  }
}

/**
 * A Server Component. `t` is compiled away entirely: what ships is a ternary
 * over the request locale, with both translations inlined as literals.
 */
export default function HomePage() {
  return (
    <>
      <h1>{t`A small starter with room to grow.`}</h1>
      <p>{t`This paragraph was rendered on the server.`}</p>
      <Counter />
    </>
  )
}
