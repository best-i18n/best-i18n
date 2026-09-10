import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page'
import { createRelativeLink } from 'fumadocs-ui/mdx'
import { notFound } from 'next/navigation'
import { getMDXComponents } from '~/components/mdx'
import { i18n } from '~/lib/i18n'
import { gitConfig, repoAppDir } from '~/lib/shared'
import { getPageImageUrl, getPageMarkdownUrl, source } from '~/lib/source'
import type { Metadata } from 'next'

/**
 * Params for one locale. The `(main)` tree asks for the default language and
 * drops the `lang` key - its route has no such segment - while `[lang]` asks
 * for everything else.
 */
export function withGenerateStaticParams(lang: string) {
  const params = source.generateParams().filter((param) => param.lang === lang)

  return lang === i18n.defaultLanguage
    ? params.map(({ slug }) => ({ slug }))
    : params
}

export async function withGenerateMetadata(
  lang: string,
  props: { params: Promise<{ slug?: string[] }> },
): Promise<Metadata> {
  const { slug } = await props.params
  const page = source.getPage(slug, lang)
  if (!page) notFound()

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: getPageImageUrl(page).url,
    },
  }
}

export async function WithPage(
  lang: string,
  props: { params: Promise<{ slug?: string[] }> },
) {
  const { slug } = await props.params
  const page = source.getPage(slug, lang)
  if (!page) notFound()

  const MDX = page.data.body
  const markdownUrl = getPageMarkdownUrl(page).url

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className='mb-0'>
        {page.data.description}
      </DocsDescription>
      <div className='flex flex-row gap-2 items-center border-b pb-6'>
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover
          markdownUrl={markdownUrl}
          githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/${repoAppDir}/content/docs/${page.path}`}
        />
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  )
}
