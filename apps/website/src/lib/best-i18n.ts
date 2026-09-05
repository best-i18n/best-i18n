import { defineI18nConfig } from 'best-i18n/next/config'

// The site dogfoods best-i18n for its own UI strings (the landing page).
// The locale segment is fumadocs' `[lang]`, not the default `[locale]`.
export const i18nConfig = defineI18nConfig({
  locales: ['en', 'zh'],
  baseLocale: 'en',
  localeParam: 'lang',
})
