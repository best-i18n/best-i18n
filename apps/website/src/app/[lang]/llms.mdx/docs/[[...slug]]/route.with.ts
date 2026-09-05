import { notFound } from 'next/navigation'
import { i18n } from '~/lib/i18n'
import { getLLMText, getPageMarkdownUrl, source } from '~/lib/source'

export async function withGET(lang: string, slug: string[] | undefined) {
  // remove the appended "content.md"
  const page = source.getPage(slug?.slice(0, -1), lang)
  if (!page) notFound()

  return new Response(await getLLMText(page), {
    headers: {
      'Content-Type': 'text/markdown',
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
