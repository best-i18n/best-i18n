import type { UrlConfig } from 'best-i18n/locale-url'

/** English unprefixed, Chinese under `/zh` - the same shape as the other playgrounds. */
export const i18n: UrlConfig = {
  locales: ['en', 'zh'],
  baseLocale: 'en',
  exclude: '^/(_app|api)',
}
