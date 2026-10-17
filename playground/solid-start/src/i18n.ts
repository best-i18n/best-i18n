import config from '../i18n.config.ts'
import type { UrlConfig } from 'best-i18n/locale-url'

export const i18n: UrlConfig = {
  locales: config.locales,
  baseLocale: config.baseLocale,
}
