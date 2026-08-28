import { createMiddleware, createStart } from '@tanstack/react-start'
import { withRequestLocale } from 'best-i18n/server'

import { i18n } from './i18n'

/**
 * Binds the locale for the whole request, before anything renders.
 *
 * This is the case the library was designed around and the reason
 * `withRequestLocale` exists: TanStack Start hands over the request handler, so
 * the render really can be wrapped in AsyncLocalStorage and `getLocale()` is
 * correct everywhere below without a single per-component call.
 */
const localeMiddleware = createMiddleware().server(({ next, request }) =>
  withRequestLocale(request, i18n, () => next()),
)

export const startInstance = createStart(() => ({
  requestMiddleware: [localeMiddleware],
}))
