import { For } from 'solid-js'
import { useI18n } from './i18n/index.tsx'
import { deLocalizePathname, locales, localizePathname } from './i18n/url.ts'

const LABELS: Record<string, string> = {
  en: 'English',
  zh: '中文',
}

/** Remembers the choice in a cookie and navigates to the localized URL. */
function switchLocale(locale: (typeof locales)[number]) {
  document.cookie = `LOCALE=${locale}; path=/; max-age=31536000; SameSite=Lax`
  window.location.assign(
    localizePathname(deLocalizePathname(window.location.pathname), locale),
  )
}

export default function LocaleSwitcher() {
  const { locale } = useI18n()
  return (
    <div>
      <For each={locales}>
        {(item) => (
          <button
            type='button'
            aria-current={item === locale() ? 'true' : undefined}
            disabled={item === locale()}
            onClick={() => switchLocale(item)}
          >
            {LABELS[item] ?? item}
          </button>
        )}
      </For>
    </div>
  )
}
