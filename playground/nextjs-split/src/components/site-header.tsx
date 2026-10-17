import { t } from 'best-i18n/macro'
import { Link } from 'best-i18n/next/navigation'
import { LocaleSwitcher } from '@/components/locale-switcher'

// "Billing" and "Settings" are also the page headings, so those two texts
// are used from three shards and rise to the root catalog.
export function SiteHeader() {
  return (
    <header>
      <nav>
        <Link href='/'>{t`Home`}</Link>
        <Link href='/billing'>{t`Billing`}</Link>
        <Link href='/settings'>{t`Settings`}</Link>
      </nav>
      <LocaleSwitcher />
    </header>
  )
}
