import config from '../i18n.config.ts'
import type { UrlConfig } from 'best-i18n/locale-url'

/** English unprefixed, Chinese under `/zh` - the same shape as the Next.js playground. */
export const i18n: UrlConfig = {
  locales: config.locales,
  baseLocale: config.baseLocale,
  exclude: '^/(api|_build|@)',
}
