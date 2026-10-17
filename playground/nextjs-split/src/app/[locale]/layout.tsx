import { getLocale } from 'best-i18n/next/server'
import { LocaleProvider } from 'best-i18n/react'
import { SiteHeader } from '@/components/site-header'
import { i18n } from '@/i18n'
import '../globals.css'
import type { ReactNode } from 'react'

export function generateStaticParams() {
  return i18n.locales.map((locale) => ({ locale }))
}

export const dynamicParams = false

export default function LocaleLayout({ children }: { children: ReactNode }) {
  const locale = getLocale()

  return (
    <html lang={locale}>
      <body>
        <LocaleProvider locale={locale} config={i18n}>
          <SiteHeader />
          <main>{children}</main>
        </LocaleProvider>
      </body>
    </html>
  )
}
