'use client'
import { Trans } from 'best-i18n/react/macro'

export function A({ url, name }) {
  return (
    <p>
      <Trans>Read the <a href={url}>docs, {name}</a></Trans>
    </p>
  )
}
