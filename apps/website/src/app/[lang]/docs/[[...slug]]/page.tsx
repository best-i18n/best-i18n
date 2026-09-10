import { i18n } from '~/lib/i18n'
import {
  withGenerateMetadata,
  withGenerateStaticParams,
  WithPage,
} from './page.with'
import type { Metadata } from 'next'

export function generateStaticParams() {
  return i18n.languages
    .filter((lang) => lang !== i18n.defaultLanguage)
    .flatMap((lang) => withGenerateStaticParams(lang))
}

export async function generateMetadata(
  props: PageProps<'/[lang]/docs/[[...slug]]'>,
): Promise<Metadata> {
  const { lang } = await props.params
  return withGenerateMetadata(lang, props)
}

export default async function Page(
  props: PageProps<'/[lang]/docs/[[...slug]]'>,
) {
  const { lang } = await props.params
  return WithPage(lang, props)
}
