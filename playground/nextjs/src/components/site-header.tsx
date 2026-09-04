import { t } from 'best-i18n/macro'

import { Link } from 'best-i18n/next/navigation'
import { LocaleSwitcher } from '@/components/locale-switcher'

/**
 * A Server Component rendering client components. `Link` carries the current
 * locale into every href, so a link written as `/about` lands on `/zh/about`
 * while Chinese is active.
 */
export function SiteHeader() {
  return (
    <header>
      <nav>
        <Link href='/'>{t`Home`}</Link>
        <Link href='/about'>{t`About`}</Link>
        <Link href='/long'>{t`Long read`}</Link>
      </nav>
      <LocaleSwitcher />
    </header>
  )
}
