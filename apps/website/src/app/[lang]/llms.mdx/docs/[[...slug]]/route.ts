import { notFound } from 'next/navigation'
import { i18n } from '~/lib/i18n'
import { getLLMText, getPageMarkdownUrl, source } from '~/lib/source'

export const revalidate = false

export async function GET(
  _req: Request,
  { params }: RouteContext<'/[lang]/llms.mdx/docs/[[...slug]]'>,
) {
  const { slug, lang } = await params
  // remove the appended "content.md"
  const page = source.getPage(slug?.slice(0, -1), lang)
  if (!page) notFound()

  return new Response(await getLLMText(page), {
    headers: {
      // Without an explicit charset browsers fall back to a legacy encoding
      // and render the Chinese pages as mojibake.
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  })
}

// A route handler sits outside the layout tree, so Next calls this with no
// parent params: enumerate the prefixed locales. The generated `(unprefixed)`
// twin calls it with English pinned, and gets English alone.
export function generateStaticParams({
  params,
}: {
  params?: { lang?: string }
}) {
  const langs = params?.lang
    ? [params.lang]
    : i18n.languages.filter((lang) => lang !== i18n.defaultLanguage)

  return langs.flatMap((lang) =>
    source.getPages(lang).map((page) => ({
      lang,
      slug: getPageMarkdownUrl(page).segments,
    })),
  )
}
