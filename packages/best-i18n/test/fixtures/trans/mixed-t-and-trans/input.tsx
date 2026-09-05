import { t } from 'best-i18n/macro'
import { Trans } from 'best-i18n/react/macro'
export function A() {
  return (
    <div title={t`Just words.`}>
      <Trans>Read the <a href={url}>docs</a> to learn more.</Trans>
    </div>
  )
}
