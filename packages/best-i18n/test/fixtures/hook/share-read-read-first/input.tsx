'use client'
import { useLocale } from 'best-i18n/react'
import { useI18n } from 'best-i18n/react/macro'

export function About() {
  const locale = useLocale()
  const t = useI18n()

  return <p lang={locale}>{t`About`}</p>
}
