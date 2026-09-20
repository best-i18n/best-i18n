import { createSubscriber } from 'svelte/reactivity'
import { getLocale as readLocale, subscribeLocale } from './runtime/index.ts'
import type { Locale } from './runtime/index.ts'

const trackLocale = createSubscriber(subscribeLocale)

/**
 * Reactive locale read for Svelte 5. Tracked when called inside a template
 * expression, `$derived` or `$effect`; a plain read anywhere else. The same
 * name as `best-i18n/runtime`, for `.svelte.ts` modules and code shared with
 * other frameworks.
 */
export function getLocale(): Locale {
  trackLocale()
  return readLocale()
}

/**
 * The current locale as a reactive getter, the shape `$app/state` and
 * `svelte/reactivity` use: `{locale.current}` in a template, or
 * `$derived(locale.current)` in a script, updates when the locale changes.
 *
 * @example
 *   <script lang="ts">
 *     import { locale } from 'best-i18n/svelte'
 *   </script>
 *
 *   <button disabled={locale.current === 'zh'}>中文</button>
 */
export const locale: { readonly current: Locale } = {
  get current(): Locale {
    return getLocale()
  },
}

export { configure, getLocales, setLocale } from './runtime/index.ts'
