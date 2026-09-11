'use client'
import { useLocale } from 'best-i18n/react'

export function About() {
  const locale = useLocale()
  const t = locale

  return <p lang={locale}>{(t === "zh" ? `关于` : `About`)}</p>
}
