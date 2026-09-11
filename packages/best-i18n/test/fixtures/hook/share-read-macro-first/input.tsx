'use client'
import { useLocale } from 'best-i18n/react'
import { useI18n } from 'best-i18n/react/macro'

export function About() {
  const t = useI18n()
  const locale = useLocale()

  return <p lang={locale}>{t`About`}</p>
}
