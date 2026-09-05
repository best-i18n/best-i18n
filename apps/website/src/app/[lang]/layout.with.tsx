import { t } from 'best-i18n/macro'
import { setRequestLocale } from 'best-i18n/next/server'
import { LocaleProvider } from 'best-i18n/react'
import { Inter } from 'next/font/google'
import { Provider } from '~/components/provider'
import { i18nConfig } from '~/lib/best-i18n'
import { appName } from '~/lib/shared'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

const inter = Inter({
  subsets: ['latin'],
})

export async function withGenerateMetadata(lang: string): Promise<Metadata> {
  setRequestLocale(lang)

  return {
    title: {
      template: `%s | ${appName}`,
      default: appName,
    },
    description: t`Compile-time i18n: no keys, no runtime, no catalog to load. Translations inline at the call site.`,
  }
}

export function WithLayout(lang: string, props: { children: ReactNode }) {
  return (
    <html lang={lang} className={inter.className} suppressHydrationWarning>
      <body className='flex flex-col min-h-screen'>
        <LocaleProvider locale={lang} config={i18nConfig}>
          <Provider lang={lang}>{props.children}</Provider>
        </LocaleProvider>
      </body>
    </html>
  )
}
