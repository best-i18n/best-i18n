import { getLocale } from 'best-i18n/next/server'
import { LocaleProvider } from 'best-i18n/react'

import { SiteHeader } from '@/components/site-header'
import { i18n } from '@/i18n'

import '../globals.css'

import type { ReactNode } from 'react'

/** Relative `alternates` need a base to resolve against. */
export const metadata = {
  metadataBase: new URL('https://best-i18n.example'),
}

/** Both locales prerender; the proxy points `/about` at the `en` one. */
export function generateStaticParams() {
  return i18n.locales.map((locale) => ({ locale }))
}

/** `/nope/about` is a 404, not a render with a nonsense locale. */
export const dynamicParams = false

export default function LocaleLayout({ children }: { children: ReactNode }) {
  // Synchronous, and the only line of setup this needs: the locale is the
  // route param, which Server Components can read during a static prerender
  // as well as during a request. Importing it here is also what teaches the
  // runtime where Next keeps the locale.
  const locale = getLocale()

  return (
    <html lang={locale}>
      <body>
        {/*
          Server Components resolve the locale themselves. Client components
          render in a second module graph that cannot see it, and this is the
          one channel that reaches them - handing the same value across is what
          keeps SSR and hydration in step.
        */}
        <LocaleProvider locale={locale} config={i18n}>
          <SiteHeader />
          <main>{children}</main>
        </LocaleProvider>
      </body>
    </html>
  )
}
