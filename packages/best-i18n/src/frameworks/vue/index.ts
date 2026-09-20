import { computed, shallowRef } from 'vue'
import {
  getLocale as readLocale,
  isServer,
  subscribeLocale,
} from '../../runtime/index.ts'
import type { ComputedRef } from 'vue'
import type { Locale } from '../../runtime/index.ts'

// One ref bridges the shared locale store into Vue's reactivity. The locale
// itself stays in the runtime: SSR must read it per request, and configure()
// may change the fallback before the first client render. On the server
// nothing subscribes - the locale is fixed for the request.
const version = shallowRef(0)
if (!isServer) subscribeLocale(() => void version.value++)

/**
 * Reactive locale read for Vue 3. Tracked when called during a render, in a
 * `computed` or in `watchEffect`; a plain read anywhere else. The same name
 * as `best-i18n/runtime`, for composables and code shared with other
 * frameworks.
 */
export function getLocale(): Locale {
  if (!isServer) void version.value
  return readLocale()
}

/**
 * The current locale as a computed ref, the shape Vue composables return:
 * `const locale = useLocale()` in `<script setup>`, then `locale.value` or
 * just `locale` in the template.
 */
export function useLocale(): ComputedRef<Locale> {
  return computed(getLocale)
}

export { configure, getLocales, setLocale } from '../../runtime/index.ts'
