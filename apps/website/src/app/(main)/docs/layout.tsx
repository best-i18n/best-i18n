import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { i18n } from '~/lib/i18n'
import { baseOptions } from '~/lib/layout.shared'
import { source } from '~/lib/source'

export default function Layout({ children }: { children: React.ReactNode }) {
  const lang = i18n.defaultLanguage

  return (
    <DocsLayout tree={source.getPageTree(lang)} {...baseOptions(lang)}>
      {children}
    </DocsLayout>
  )
}
