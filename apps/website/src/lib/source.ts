import { loader } from 'fumadocs-core/source'
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema'
import { defineDocs } from 'fumadocs-mdx/macro'
import { i18n } from '~/lib/i18n'
import { docsContentRoute, docsImageRoute, docsRoute } from './shared'

const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
})

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: docsRoute,
  i18n,
  source: docs.toFumadocsSource(),
  plugins: [],
})

// The default locale is unprefixed, mirroring `hideLocale` above.
function localeSegment(locale: string | undefined) {
  return locale === i18n.defaultLanguage ? undefined : locale
}

export function getPageImageUrl(page: (typeof source)['$inferPage']) {
  const segments = [...page.slugs, 'image.png']

  return {
    segments,
    url: `/${[
      localeSegment(page.locale),
      ...docsImageRoute.split('/'),
      ...segments,
    ]
      .filter(Boolean)
      .join('/')}`,
  }
}

export function getPageMarkdownUrl(page: (typeof source)['$inferPage']) {
  const segments = [...page.slugs, 'content.md']

  return {
    segments,
    url: `/${[
      localeSegment(page.locale),
      ...docsContentRoute.split('/'),
      ...segments,
    ]
      .filter(Boolean)
      .join('/')}`,
  }
}

export async function getLLMText(page: (typeof source)['$inferPage']) {
  const processed = await page.data.getText('processed')

  return `# ${page.data.title} (${page.url})

${processed}`
}
