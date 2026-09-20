export const locales = ['en', 'zh'] as const
export type Locale = (typeof locales)[number]
export const baseLocale: Locale = 'en'

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
export function localizePathname(path: string, locale: Locale): string {
  if (locale === baseLocale) return path
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
  return acceptedLocale(request.headers.get('accept-language')) ?? baseLocale
}

/**
 * The supported locale with the highest `q`; `q=0` means "never", and a
 * missing `q` is 1. `zh-CN;q=0.9, en;q=0.8` picks `zh`.
 */
function acceptedLocale(header: string | null): Locale | undefined {
  let best: { locale: Locale; q: number } | undefined
  for (const part of header?.split(',') ?? []) {
    const [tag = '', ...params] = part.trim().split(';')
    const quality = params
      .map((param) => param.trim())
      .find((param) => param.startsWith('q='))
    const q = quality === undefined ? 1 : Number(quality.slice(2))
    const locale = tag.trim().toLowerCase().split('-')[0]
    if (!isLocale(locale) || !(q > 0)) continue
    if (best === undefined || q > best.q) best = { locale, q }
  }
  return best?.locale
}
