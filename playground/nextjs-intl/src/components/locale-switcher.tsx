'use client'

import { useLocale } from 'next-intl'

import { usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

const LABELS: Record<string, string> = {
  en: 'English',
  zh: '中文',
}

export function LocaleSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()

  return (
    <div>
      {routing.locales.map((item) => (
        <button
          key={item}
          type='button'
          aria-current={item === locale}
          disabled={item === locale}
          onClick={() => router.replace(pathname, { locale: item })}
        >
          {LABELS[item] ?? item}
        </button>
      ))}
    </div>
  )
}
