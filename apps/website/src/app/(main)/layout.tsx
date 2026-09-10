import type { Metadata } from 'next'

import { i18n } from '~/lib/i18n'

import { withGenerateMetadata, WithLayout } from '../[lang]/layout.with'

export async function generateMetadata(): Promise<Metadata> {
  return withGenerateMetadata(i18n.defaultLanguage)
}

export default function Layout(props: { children: React.ReactNode }) {
  return WithLayout(i18n.defaultLanguage, props)
}
