import { createMiddleware } from '@solidjs/start/middleware'
import { resolveLocale } from './i18n/url.ts'

/**
 * The primitive has no request binding of its own; decide here, per request.
 * The `onRequest` form receives Solid's FetchEvent, whose `locals` is what
 * `getRequestEvent()` later hands to the render.
 */
export default createMiddleware({
  onRequest: (event) => {
    event.locals.locale = resolveLocale(event.request)
  },
})
