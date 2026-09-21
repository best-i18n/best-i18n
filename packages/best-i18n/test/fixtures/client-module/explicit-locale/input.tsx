'use client'
import { t } from 'best-i18n/macro'
import { Trans } from 'best-i18n/react/macro'

export function Email({ to }: { to: string }) {
  return (
    <>
      <h1>{t.locale(to)`About`}</h1>
      <p>
        <Trans locale="zh">Say <b>hi</b></Trans>
      </p>
    </>
  )
}
