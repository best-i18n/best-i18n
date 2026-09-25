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
import { gitConfig, repoAppDir } from '~/lib/shared'
import { getPageImageUrl, getPageMarkdownUrl, source } from '~/lib/source'
import type { Metadata } from 'next'

// One locale at a time, handed down from the layout above: `[lang]` asks for
// each prefixed locale, and the generated `(unprefixed)` twin asks for English
// and drops the `lang` key itself.
export function generateStaticParams({ params }: { params: { lang: string } }) {
  return source.generateParams().filter((param) => param.lang === params.lang)
}

export async function generateMetadata(
  props: PageProps<'/[lang]/docs/[[...slug]]'>,
): Promise<Metadata> {
  const { lang, slug } = await props.params
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

export default async function Page(
  props: PageProps<'/[lang]/docs/[[...slug]]'>,
) {
  const { lang, slug } = await props.params
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
