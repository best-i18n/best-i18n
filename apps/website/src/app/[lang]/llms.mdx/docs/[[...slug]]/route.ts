import { i18n } from '~/lib/i18n'
import { withGenerateStaticParams, withGET } from './route.with'

export const revalidate = false

export async function GET(
  _req: Request,
  { params }: RouteContext<'/[lang]/llms.mdx/docs/[[...slug]]'>,
) {
  const { slug, lang } = await params
  return withGET(lang, slug)
}

export function generateStaticParams() {
  return i18n.languages
    .filter((lang) => lang !== i18n.defaultLanguage)
    .flatMap((lang) => withGenerateStaticParams(lang))
}
