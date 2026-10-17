import { t } from 'best-i18n/macro'
import { NotificationSettings } from '@/features/settings/notifications'
import { ProfileForm } from '@/features/settings/profile-form'

export default function SettingsPage() {
  return (
    <>
      <h1>{t`Settings`}</h1>
      <p>{t`How you appear, and what we email you about.`}</p>
      <ProfileForm />
      <NotificationSettings />
    </>
  )
}
