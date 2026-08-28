import { Link } from '@tanstack/react-router'
import { t } from 'best-i18n/macro'

import { LocaleSwitcher } from '@/components/locale-switcher'

/**
 * Plain `<Link>` from the router: the locale prefix is added by the router's
 * output rewrite, so nothing here has to know which language it is in.
 */
export function SiteHeader() {
  return (
    <header>
      <nav>
        <Link to='/'>{t`Home`}</Link>
        <Link to='/about'>{t`About`}</Link>
      </nav>
      <LocaleSwitcher />
    </header>
  )
}
