import { i18n } from '~/lib/i18n'
import { withGenerateMetadata, WithLayout } from './layout.with'
import type { Metadata } from 'next'

export async function generateMetadata({
  params,
}: LayoutProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await params
  return withGenerateMetadata(lang)
}

// Only the prefixed locales - English is served unprefixed by `(main)`.
export function generateStaticParams() {
  return i18n.languages
    .filter((lang) => lang !== i18n.defaultLanguage)
    .map((lang) => ({ lang }))
}

export const dynamicParams = false

export default async function Layout({
  children,
  params,
}: LayoutProps<'/[lang]'>) {
  const { lang } = await params

  return WithLayout(lang, { children })
}
