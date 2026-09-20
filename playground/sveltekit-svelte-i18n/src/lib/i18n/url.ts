import { baseLocale, locales } from './index.ts'
import type { Locale } from './index.ts'

function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (locales as readonly string[]).includes(value)
}

/** The locale a `/zh/...` prefix names, if any. */
export function localeFromPathname(pathname: string): Locale | undefined {
  const first = pathname.split('/')[1]
  return isLocale(first) && first !== baseLocale ? first : undefined
}

/** `/zh/about` becomes `/about`; anything without a prefix is unchanged. */
export function deLocalizePathname(pathname: string): string {
  const locale = localeFromPathname(pathname)
  if (locale === undefined) return pathname
  return pathname.slice(locale.length + 1) || '/'
}

/** `/about` while Chinese is active becomes `/zh/about`. */
export function href(path: string, locale: string | null | undefined): string {
  if (!locale || locale === baseLocale) return path
  return path === '/' ? `/${locale}` : `/${locale}${path}`
}

/** URL prefix, then cookie, then Accept-Language, then the base locale. */
export function resolveLocale(request: Request): Locale {
  const url = new URL(request.url)
  const fromUrl = localeFromPathname(url.pathname)
  if (fromUrl !== undefined) return fromUrl
  const cookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('LOCALE='))
    ?.slice('LOCALE='.length)
  if (isLocale(cookie)) return cookie
  const accepted = request.headers
    .get('accept-language')
    ?.split(',')
    .map((part) => part.trim().split(';')[0]?.split('-')[0])
    .find(isLocale)
  return accepted ?? baseLocale
}
