'use client'
import { localizePathname } from 'best-i18n/locale-url'
import { i18nProvider } from 'fumadocs-ui/i18n'
import { RootProvider } from 'fumadocs-ui/provider/next'
import { usePathname, useRouter } from 'next/navigation'
import SearchDialog from '~/components/search'
import { i18nConfig } from '~/lib/best-i18n'
import { translations } from '~/lib/layout.shared'
import type { ReactNode } from 'react'

export function Provider({
  lang,
  children,
}: {
  lang: string
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <RootProvider
      i18n={{
        ...i18nProvider(translations, lang),
        // The default handler swaps the first path segment, but the base
        // locale has no segment - localizePathname knows both spellings.
        onLocaleChange: (locale) =>
          router.push(localizePathname(pathname, locale, i18nConfig)),
      }}
      search={{ SearchDialog }}
    >
      {children}
    </RootProvider>
  )
}
