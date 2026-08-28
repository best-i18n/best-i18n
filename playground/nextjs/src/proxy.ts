import { createProxy } from 'best-i18n/next/proxy'

import { i18n } from '@/i18n'

/**
 * Resolves the locale for every page request and rewrites `/zh/about` to
 * `/about`, so `src/app` holds one route tree with no `[locale]` segment.
 */
export const proxy = createProxy(i18n)

export const config = {
  // Everything except Next's own assets and anything that looks like a file.
  matcher: ['/((?!_next|.*\\..*).*)'],
}
