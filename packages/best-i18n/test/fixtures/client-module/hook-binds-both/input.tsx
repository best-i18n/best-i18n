'use client'
import { Trans, useI18n } from 'best-i18n/react/macro'

export function A() {
  const t = useI18n()
  return (
    <p>
      {t`About`}
      <Trans>About</Trans>
    </p>
  )
}
