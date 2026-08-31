import { isPathExcluded, localizePathname, splitLocale } from './locale-url.ts'

import type { UrlConfig } from './locale-url.ts'

export interface SwitchConfig extends UrlConfig {
  cookieName?: string
  cookieMaxAge?: number
}

const DEFAULT_COOKIE = 'LOCALE'
const ONE_YEAR = 60 * 60 * 24 * 365

/**
 * Resolves the locale on the client with the same precedence the server uses
 * in `resolveLocale`: URL prefix, then cookie, then browser language, then the
 * base locale. Diverging from the server order causes hydration mismatches on
 * unprefixed paths - the server renders one language and the client another.
 *
 * Pure so it can be tested: pass `document.cookie` and `navigator.languages`.
 */
export function resolveClientLocale(options: {
  pathname: string
  cookie: string
  languages: readonly string[]
  config: SwitchConfig
}): string {
  const { pathname, cookie, languages, config } = options

  const fromUrl = splitLocale(pathname, config).locale
  if (fromUrl !== undefined) return fromUrl

  if (isPathExcluded(pathname, config)) return config.baseLocale

  const name = config.cookieName ?? DEFAULT_COOKIE
  for (const part of cookie.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key !== name) continue
    // A malformed %-escape must fall through, not throw at module scope in
    // whatever router bootstrap called this.
    let candidate: string
    try {
      candidate = decodeURIComponent(value.join('='))
    } catch {
      continue
    }
    if (config.locales.includes(candidate)) return candidate
  }

  // navigator.languages is the client-side face of Accept-Language.
  for (const language of languages) {
    const tag = language.toLowerCase()
    const exact = config.locales.find((locale) => locale.toLowerCase() === tag)
    if (exact !== undefined) return exact

    const prefix = tag.split('-')[0]
    const partial = config.locales.find(
      (locale) => locale.toLowerCase() === prefix,
    )
    if (partial !== undefined) return partial
  }

  return config.baseLocale
}

/**
 * Remembers the choice in a cookie and navigates to the localized URL.
 *
 * A full navigation rather than a client-side one: in a per-locale build the
 * other locale's strings are not in this bundle at all.
 */
export function switchLocale(locale: string, config: SwitchConfig): void {
  const name = config.cookieName ?? DEFAULT_COOKIE
  const maxAge = config.cookieMaxAge ?? ONE_YEAR

  document.cookie = `${name}=${encodeURIComponent(locale)}; path=/; max-age=${maxAge}; SameSite=Lax`

  const url = new URL(window.location.href)
  url.pathname = localizePathname(url.pathname, locale, config)

  window.location.assign(url.toString())
}
