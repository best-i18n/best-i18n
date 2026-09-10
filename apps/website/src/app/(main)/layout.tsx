import { i18n } from '~/lib/i18n'
import { withGenerateMetadata, WithLayout } from '../[lang]/layout.with'
import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return withGenerateMetadata(i18n.defaultLanguage)
}

export default function Layout(props: { children: React.ReactNode }) {
  return WithLayout(i18n.defaultLanguage, props)
}
