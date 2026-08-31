import { getLocale, locales, setLocale } from '@/paraglide/runtime'

const LABELS: Record<string, string> = {
  en: 'English',
  zh: '中文',
}

export function LocaleSwitcher() {
  const locale = getLocale()

  return (
    <div>
      {locales.map((item) => (
        <button
          key={item}
          type='button'
          aria-current={item === locale}
          disabled={item === locale}
          onClick={() => setLocale(item)}
        >
          {LABELS[item] ?? item}
        </button>
      ))}
    </div>
  )
}
