import { switchLocale } from 'best-i18n/client'
import { useLocale } from 'best-i18n/react'

import { i18n } from '@/i18n'

const LABELS: Record<string, string> = {
  en: 'English',
  zh: '中文',
}

export function LocaleSwitcher() {
  const locale = useLocale()

  return (
    <div>
      {i18n.locales.map((item) => (
        <button
          key={item}
          type='button'
          aria-current={item === locale}
          disabled={item === locale}
          onClick={() => switchLocale(item, i18n)}
        >
          {LABELS[item] ?? item}
        </button>
      ))}
    </div>
  )
}
