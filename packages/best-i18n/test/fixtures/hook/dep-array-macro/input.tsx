'use client'
import { useI18n } from 'best-i18n/react/macro'
import { useMemo } from 'react'

export function About() {
  const t = useI18n()

  return useMemo(() => t`About`, [t])
}
