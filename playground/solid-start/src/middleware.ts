import { createMiddleware } from '@solidjs/start/middleware'
import { withLocale, withRequestLocale } from 'best-i18n/server'
import { i18n } from './i18n.ts'

export default createMiddleware([
  (event, next) =>
    import.meta.env.I18N_STATIC_LOCALE
      ? withLocale(import.meta.env.I18N_STATIC_LOCALE, next)
      : withRequestLocale(event.req, i18n, next),
])
