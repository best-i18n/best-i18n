'use client'
import { useLocale } from 'best-i18n/react'

export function About() {
  const t = useLocale()
  const locale = t

  return <p lang={locale}>{(t === "zh" ? `关于` : `About`)}</p>
}
