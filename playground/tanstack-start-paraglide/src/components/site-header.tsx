import { Link } from '@tanstack/react-router'

import { LocaleSwitcher } from '@/components/locale-switcher'
import { m } from '@/paraglide/messages'

export function SiteHeader() {
  return (
    <header>
      <nav>
        <Link to='/'>{m.home()}</Link>
        <Link to='/about'>{m.about()}</Link>
      </nav>
      <LocaleSwitcher />
    </header>
  )
}
