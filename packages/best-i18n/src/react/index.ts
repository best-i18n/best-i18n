'use client'

import {
  createContext,
  createElement,
  useContext,
  useSyncExternalStore,
} from 'react'

import { getLocale, setLocale, subscribeLocale } from '../runtime/index.ts'

import type { ReactNode } from 'react'
import type { UrlConfig } from '../locale-url.ts'
import type { Locale } from '../runtime/index.ts'

/**
 * Set by `LocaleProvider` when the host already knows the locale for this
 * render - a server-rendered request, typically. `undefined` means "no
 * provider", which is not the same as "no locale", so it has to stay
 * distinguishable from a real value.
 */
const LocaleContext = createContext<Locale | undefined>(undefined)

const UrlConfigContext = createContext<UrlConfig | undefined>(undefined)

/**
 * Supplies the locale, and optionally the URL layout, to everything below it.
 *
 * Needed wherever client components are rendered on the server: the ambient
 * client locale does not exist there, and the per-request locale lives in a
 * different module graph than the one the client build sees. React is the only
 * channel both halves share, so passing the locale through it is what makes
 * server output and the first client render agree.
 *
 * Purely client-rendered apps can skip it - `useI18n()` falls back to the ambient
 * locale that `setLocale()` maintains.
 *
 * On the client it also mirrors the locale into that ambient store, so the
 * plain `t` macro and `<Trans>` - which read `getLocale()` rather than a hook -
 * agree with the provider instead of quietly falling back to the base locale.
 * The ambient locale is a single global, so nesting two providers with
 * different locales is only safe for `useI18n()` and `useLocale()`, which read
 * the context.
 */
export function LocaleProvider(props: {
  locale: Locale
  /**
   * Needed by the locale-aware navigation helpers. Keep it serializable
   * (`exclude` as a string) so it can cross a server/client boundary.
   */
  config?: UrlConfig
  children?: ReactNode
}): ReactNode {
  // During render rather than in an effect, and deliberately: an effect runs
  // after the first paint, which would leave that paint in the wrong language.
  // The provider renders above its children, so by the time anything reads the
  // locale it is set. Nothing is subscribed yet on the render that matters -
  // hydration - and `setLocale` is a no-op when the value has not changed, so
  // this cannot notify anyone mid-render.
  if (typeof window !== 'undefined') setLocale(props.locale)

  return createElement(
    LocaleContext.Provider,
    { value: props.locale },
    createElement(
      UrlConfigContext.Provider,
      { value: props.config },
      props.children,
    ),
  )
}

/**
 * The current locale as reactive React state: the component re-renders when
 * `setLocale` changes it, or when a `LocaleProvider` above it renders a
 * different locale.
 */
export function useLocale(): Locale {
  const provided = useContext(LocaleContext)

  // Both hooks run unconditionally - a provider may appear or disappear
  // between renders, and hook order may not.
  const ambient = useSyncExternalStore(subscribeLocale, getLocale, getLocale)

  return provided ?? ambient
}

/** The URL layout from the nearest `LocaleProvider`, if one supplied it. */
export function useUrlConfig(): UrlConfig | undefined {
  return useContext(UrlConfigContext)
}
