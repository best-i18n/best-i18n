'use client'
import { useLocale } from 'best-i18n/react'

export function About() {
  const locale = useLocale()
  const t = "zh"

  return <p lang={locale}>{`关于`}</p>
}
