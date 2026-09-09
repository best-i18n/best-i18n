'use client'
import { Trans } from 'best-i18n/react/macro'

export function A({ cond }) {
  return (
    <p>
      {cond && <Trans>About</Trans>}
      <img alt={cond ? <Trans>Just words.</Trans> : ''} />
    </p>
  )
}
