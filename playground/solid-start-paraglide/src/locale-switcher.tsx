import { For } from 'solid-js'
import { getLocale, locales, setLocale } from './paraglide/runtime'

const LABELS: Record<string, string> = {
  en: 'English',
  zh: '中文',
}

export default function LocaleSwitcher() {
  // Not reactive: paraglide's setLocale() navigates to the localized URL, so
  // the component is rendered again from scratch.
  const locale = getLocale()
  return (
    <div>
      <For each={locales}>
        {(item) => (
          <button
            type='button'
            aria-current={item === locale ? 'true' : undefined}
            disabled={item === locale}
            onClick={() => setLocale(item)}
          >
            {LABELS[item] ?? item}
          </button>
        )}
      </For>
    </div>
  )
}
