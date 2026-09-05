import { generate as DefaultImage } from 'fumadocs-ui/og'
import { notFound } from 'next/navigation'
import { ImageResponse } from 'next/og'
import { i18n } from '~/lib/i18n'
import { appName } from '~/lib/shared'
import { getPageImageUrl, source } from '~/lib/source'

export async function withGET(lang: string, slug: string[]) {
  // remove the appended "image.png"
  const page = source.getPage(slug.slice(0, -1), lang)
  if (!page) notFound()

  return new ImageResponse(
    <DefaultImage
      title={page.data.title}
      description={page.data.description}
      site={appName}
    />,
    {
      width: 1200,
      height: 630,
    },
  )
}

export function withGenerateStaticParams(lang: string) {
  const params = source.getPages(lang).map((page) => ({
    lang,
    slug: getPageImageUrl(page).segments,
  }))

  return lang === i18n.defaultLanguage
    ? params.map(({ slug }) => ({ slug }))
    : params
}
