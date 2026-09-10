import { notFound } from 'next/navigation'
import { i18n } from '~/lib/i18n'
import { getLLMText, getPageMarkdownUrl, source } from '~/lib/source'

export async function withGET(lang: string, slug: string[] | undefined) {
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

export function withGenerateStaticParams(lang: string) {
  const params = source.getPages(lang).map((page) => ({
    lang,
    slug: getPageMarkdownUrl(page).segments,
  }))

  return lang === i18n.defaultLanguage
    ? params.map(({ slug }) => ({ slug }))
    : params
}
