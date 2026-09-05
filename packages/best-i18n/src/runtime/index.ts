export type Locale = string

/**
 * Reads the locale bound to the request currently being served, or undefined
 * when there is none.
 *
 * The mechanism is host-specific, so it is installed rather than implemented
 * here: `best-i18n/server` binds it to AsyncLocalStorage, `best-i18n/next/server`
 * to React's per-request cache. Keeping it out of this module is what lets the
 * module reach the browser at all - a static `node:async_hooks` import would
 * break every client bundle that inlines a message.
 */
export type RequestLocaleSource = () => Locale | undefined

let requestLocale: RequestLocaleSource | undefined

/**
 * True where there is no browser: a server render, a worker, a build step.
 *
 * Exported because it is the same question every caller has to ask before
 * touching client-only state, and it should have one answer - `setLocale`
 * refusing to run on the server is the load-bearing use of it.
 */
export const isServer = typeof window === 'undefined'

/** Locale used on the client, and as the server fallback outside a request. */
let ambientLocale: Locale | undefined

let configuredBaseLocale: Locale = 'en'
let configuredLocales: Locale[] = ['en']

/**
 * Installs the per-request locale lookup. Called by a server adapter at import
 * time; application code should not need it.
 */
export function setRequestLocaleSource(source: RequestLocaleSource): void {
  requestLocale = source
}

export function configure(options: {
  baseLocale: Locale
  locales?: Locale[]
}): void {
  configuredBaseLocale = options.baseLocale
  configuredLocales = options.locales ?? [options.baseLocale]
}

/** Every configured locale, in declaration order. */
export function getLocales(): readonly Locale[] {
  return configuredLocales
}

/**
 * The locale for the current request (server) or session (client).
 *
 * In a per-locale build this function is never called: the transform inlines
 * the target locale's string directly, so both the call and this module are
 * removed as dead code.
 */
export function getLocale(): Locale {
  const perRequest = requestLocale?.()
  if (perRequest !== undefined) return perRequest

  return ambientLocale ?? configuredBaseLocale
}

const listeners = new Set<() => void>()

/** Sets the locale for the client session. Not valid on the server. */
export function setLocale(locale: Locale): void {
  if (isServer) {
    throw new Error(
      'best-i18n: setLocale() is client-only. On the server bind the locale ' +
        'per request (withLocale/setRequestLocale) so concurrent requests ' +
        'stay isolated.',
    )
  }

  if (primeLocale(locale)) notifyLocaleListeners()
}

/**
 * Render-phase half of `setLocale`: assigns the ambient locale without waking
 * subscribers, so `LocaleProvider` can mirror its prop mid-render - notifying
 * there would setState into components React is still rendering. Pair with
 * `notifyLocaleListeners` after commit.
 *
 * @internal
 */
export function primeLocale(locale: Locale): boolean {
  if (ambientLocale === locale) return false
  ambientLocale = locale
  return true
}

/**
 * Commit-phase half of `primeLocale`: wakes `useLocale()` subscribers. A
 * no-op notification is harmless - subscribers re-read an unchanged snapshot
 * and React bails out.
 *
 * @internal
 */
export function notifyLocaleListeners(): void {
  for (const listener of listeners) listener()
}

/**
 * Subscribes to client-side locale changes. Feeds `useLocale()` via
 * useSyncExternalStore; on the server the locale is fixed per request, so
 * nothing ever fires.
 */
export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** True when a server adapter has installed per-request isolation. */
export function hasRequestIsolation(): boolean {
  return requestLocale !== undefined
}
