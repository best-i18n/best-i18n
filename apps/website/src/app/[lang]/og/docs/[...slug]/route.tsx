import { generate as DefaultImage } from 'fumadocs-ui/og'
import { notFound } from 'next/navigation'
import { ImageResponse } from 'next/og'
import { i18n } from '~/lib/i18n'
import { appName } from '~/lib/shared'
import { getPageImageUrl, source } from '~/lib/source'

export const revalidate = false

export async function GET(
  _req: Request,
  { params }: RouteContext<'/[lang]/og/docs/[...slug]'>,
) {
  const { slug, lang } = await params
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
      slug: getPageImageUrl(page).segments,
    })),
  )
}
