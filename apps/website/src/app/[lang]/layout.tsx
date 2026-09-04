import { t } from 'best-i18n/macro'
import { setRequestLocale } from 'best-i18n/next/server'
import { LocaleProvider } from 'best-i18n/react'
import { Inter } from 'next/font/google'
import { Provider } from '~/components/provider'
import { i18nConfig } from '~/lib/best-i18n'
import { i18n } from '~/lib/i18n'
import { appName } from '~/lib/shared'
import '../global.css'
import type { Metadata } from 'next'

export async function generateMetadata({
  params,
}: LayoutProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await params
  setRequestLocale(lang)

  return {
    title: {
      template: `%s | ${appName}`,
      default: appName,
    },
    description: t`Compile-time i18n: no keys, no runtime, no catalog to load. Translations inline at the call site.`,
  }
}

const inter = Inter({
  subsets: ['latin'],
})

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }))
}

export const dynamicParams = false

export default async function Layout({
  children,
  params,
}: LayoutProps<'/[lang]'>) {
  const { lang } = await params

  return (
    <html lang={lang} className={inter.className} suppressHydrationWarning>
      <body className='flex flex-col min-h-screen'>
        <LocaleProvider locale={lang} config={i18nConfig}>
          <Provider lang={lang}>{children}</Provider>
        </LocaleProvider>
      </body>
    </html>
  )
}
