'use client'
import { i18nProvider } from 'fumadocs-ui/i18n'
import { RootProvider } from 'fumadocs-ui/provider/next'
import SearchDialog from '~/components/search'
import { translations } from '~/lib/layout.shared'
import type { ReactNode } from 'react'

export function Provider({
  lang,
  children,
}: {
  lang: string
  children: ReactNode
}) {
  return (
    <RootProvider
      i18n={i18nProvider(translations, lang)}
      search={{ SearchDialog }}
    >
      {children}
    </RootProvider>
  )
}
