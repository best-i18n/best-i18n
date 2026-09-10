import { matchLocale, rankAcceptLanguage } from './locale-tag.ts'
import {
  isPathExcluded,
  localeFromPathname,
  splitLocale,
} from './locale-url.ts'
import type { UrlConfig } from './locale-url.ts'

export interface RequestConfig extends UrlConfig {
  /** Cookie that remembers an explicit choice. */
  cookieName?: string
}

const DEFAULT_COOKIE = 'LOCALE'

function fromCookie(
  request: Request,
  config: RequestConfig,
): string | undefined {
  const header = request.headers.get('cookie')
  if (header === null) return undefined

  const name = config.cookieName ?? DEFAULT_COOKIE

  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key !== name) continue
    // A cookie is attacker-supplied input: a malformed %-escape must fall
    // through to the next source, not throw a URIError on every request.
    let candidate: string
    try {
      candidate = decodeURIComponent(value.join('='))
    } catch {
      continue
    }
    if (config.locales.includes(candidate)) return candidate
  }

  return undefined
}

/** Picks the best `Accept-Language` match, honouring quality order. */
function fromHeader(
  request: Request,
  config: RequestConfig,
): string | undefined {
  const header = request.headers.get('accept-language')
  if (header === null) return undefined

  return matchLocale(rankAcceptLanguage(header), config.locales)
}

/**
 * Resolves the locale for a request: an explicit URL prefix wins, then the
 * cookie, then `Accept-Language`, then the base locale.
 */
export function resolveLocale(request: Request, config: RequestConfig): string {
  const { pathname } = new URL(request.url)

  const fromUrl = splitLocale(pathname, config).locale
  if (fromUrl !== undefined) return fromUrl

  if (isPathExcluded(pathname, config)) return config.baseLocale

  return (
    fromCookie(request, config) ??
    fromHeader(request, config) ??
    localeFromPathname(pathname, config)
  )
}
