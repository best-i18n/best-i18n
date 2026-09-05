import { Trans, useI18n } from 'best-i18n/react/macro'
export function A() {
  const t = useI18n()
  return (
    <p title={t`Just words.`}>
      <Trans>Read the <a href={url}>docs</a> to learn more.</Trans>
    </p>
  )
}
