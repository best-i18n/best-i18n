'use client'

import { useI18n } from 'best-i18n/react/macro'

// A client component: `useI18n()` binds the locale through React.
export function ProfileForm() {
  const t = useI18n()

  return (
    <section>
      <h2>{t`Profile`}</h2>
      <label>
        {t`Display name`} <input defaultValue='Ada' />
      </label>
      {/* Also on the billing plan card: one entry, in the `features` shard. */}
      <button type='button'>{t`Save`}</button>
    </section>
  )
}
