import { useTranslations } from 'next-intl'

import { LocaleSwitcher } from '@/components/locale-switcher'
import { Link } from '@/i18n/navigation'

export function SiteHeader() {
  const t = useTranslations('Nav')

  return (
    <header>
      <nav>
        <Link href='/'>{t('home')}</Link>
        <Link href='/about'>{t('about')}</Link>
      </nav>
      <LocaleSwitcher />
    </header>
  )
}
