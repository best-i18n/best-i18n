import { t } from 'best-i18n/macro'
import { Trans } from 'best-i18n/react/macro'

// Shard `features/billing`. Deeper folders under it would land here too: the
// depth caps the number of catalogs, not the shape of the source tree.
export function PlanCard() {
  const seats = 12

  return (
    <section>
      <h2>{t`Current plan`}</h2>
      <p>{t`Team plan, billed yearly.`}</p>
      <p>
        <Trans>
          You are using <strong>{seats}</strong> seats.
        </Trans>
      </p>
      <button type='button'>{t`Save`}</button>
    </section>
  )
}
