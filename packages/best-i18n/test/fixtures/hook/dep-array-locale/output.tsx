'use client'
import { useLocale } from 'best-i18n/react'
import { useMemo } from 'react'

export function About() {
  const locale = useLocale()
  const t = locale

  // The macro cannot be a dependency - it does not exist by the time this
  // runs. Depend on the locale it compiles to instead; `exhaustive-deps`
  // still asks for `t`, and the suppression is sound because `t` *is*
  // `locale` here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (t === "zh" ? `关于` : `About`), [locale])
}
