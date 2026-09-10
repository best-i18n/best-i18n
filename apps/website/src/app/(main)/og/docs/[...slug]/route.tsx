import { i18n } from '~/lib/i18n'
import {
  withGenerateStaticParams,
  withGET,
} from '../../../../[lang]/og/docs/[...slug]/route.with'

export const revalidate = false

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params
  return withGET(i18n.defaultLanguage, slug)
}

export function generateStaticParams() {
  return withGenerateStaticParams(i18n.defaultLanguage)
}
