import type { UrlConfig } from 'best-i18n/locale-url'

/** English unprefixed, Chinese under `/zh` - the same shape as the Next.js playground. */
export const i18n: UrlConfig = {
  locales: ['en', 'zh'],
  baseLocale: 'en',
  exclude: '^/(api|_build|@)',
}
