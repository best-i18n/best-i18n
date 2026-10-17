import { t } from 'best-i18n/macro'

export function NotificationSettings() {
  return (
    <section>
      <h2>{t`Notifications`}</h2>
      <label>
        <input type='checkbox' defaultChecked />{' '}
        {t`Email me when an invoice is ready`}
      </label>
    </section>
  )
}
