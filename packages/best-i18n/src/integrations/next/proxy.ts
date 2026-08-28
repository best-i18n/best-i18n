import { NextResponse } from 'next/server'

import { isPathExcluded, splitLocale } from '../../locale-url.ts'
import { resolveLocale } from '../../request.ts'
import { LOCALE_HEADER } from './config.ts'

import type { NextRequest } from 'next/server'
import type { NextI18nConfig } from './config.ts'

const DEFAULT_COOKIE = 'LOCALE'
const ONE_YEAR = 60 * 60 * 24 * 365

/**
 * Builds the Next.js proxy (Middleware before 16) that connects a public URL to
 * the `[locale]` route segment.
 *
 * The base locale is served without a prefix - `/about`, while Chinese lives at
 * `/zh/about` - but the route tree needs the segment either way, so the
 * unprefixed URL is rewritten onto it. `/en/about` is not a public URL under
 * that scheme, so it redirects to the canonical `/about` rather than serving
 * the same page at two addresses.
 *
 * @example
 *   // src/proxy.ts
 *   import { createProxy } from 'best-i18n/next/proxy'
 *   import { i18n } from './i18n.ts'
 *
 *   export const proxy = createProxy(i18n)
 *   export const config = { matcher: ['/((?!_next|.*\\..*).*)'] }
 */
export function createProxy(config: NextI18nConfig) {
  return function proxy(request: NextRequest): NextResponse {
    const url = new URL(request.url)

    if (isPathExcluded(url.pathname, config)) return NextResponse.next()

    const segments = url.pathname.split('/')

    if (segments[1] === config.baseLocale) {
      const target = new URL(url)
      target.pathname =
        segments.length > 2 ? `/${segments.slice(2).join('/')}` : '/'
      return NextResponse.redirect(target)
    }

    const { locale: fromUrl, rest } = splitLocale(url.pathname, config)
    const locale = resolveLocale(request, config)

    // A fallback for anything the `[locale]` segment does not cover, such as a
    // route handler.
    const headers = new Headers(request.headers)
    headers.set(LOCALE_HEADER, locale)

    url.pathname = rest === '/' ? `/${locale}` : `/${locale}${rest}`

    const response = NextResponse.rewrite(url, { request: { headers } })

    // Only an explicit prefix is worth remembering. Writing the cookie on
    // every request would freeze whatever Accept-Language happened to say the
    // first time, and the user could never get back to their browser default.
    if (fromUrl !== undefined) {
      response.cookies.set(config.cookieName ?? DEFAULT_COOKIE, locale, {
        path: '/',
        maxAge: config.cookieMaxAge ?? ONE_YEAR,
        sameSite: 'lax',
      })
    }

    return response
  }
}
