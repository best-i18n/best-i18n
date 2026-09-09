import { t } from 'best-i18n/macro'
import { Trans } from 'best-i18n/react/macro'

export function A({ url }) {
  return (
    <p>
      {t`About`}
      <Trans>Read the <a href={url}>docs</a></Trans>
    </p>
  )
}
