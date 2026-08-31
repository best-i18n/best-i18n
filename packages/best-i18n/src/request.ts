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

  const ranked = header
    .split(',')
    .map((entry) => {
      const [tag, ...params] = entry.trim().split(';')
      const q = params
        .map((param) => param.trim())
        .find((param) => param.startsWith('q='))
      return { tag: (tag ?? '').toLowerCase(), q: q ? Number(q.slice(2)) : 1 }
    })
    // `q=0` means explicitly not acceptable, so it must not win by existing.
    .filter(
      (entry) => entry.tag !== '' && !Number.isNaN(entry.q) && entry.q > 0,
    )
    .sort((a, b) => b.q - a.q)

  for (const { tag } of ranked) {
    const exact = config.locales.find((locale) => locale.toLowerCase() === tag)
    if (exact !== undefined) return exact

    const base = tag.split('-')[0]
    const prefix = config.locales.find(
      (locale) => locale.toLowerCase() === base,
    )
    if (prefix !== undefined) return prefix
  }

  return undefined
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
