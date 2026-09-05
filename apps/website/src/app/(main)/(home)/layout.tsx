import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { i18n } from '~/lib/i18n'
import { baseOptions } from '~/lib/layout.shared'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <HomeLayout {...baseOptions(i18n.defaultLanguage)}>{children}</HomeLayout>
  )
}
