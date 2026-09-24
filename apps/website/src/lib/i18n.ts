import { defineI18n } from 'fumadocs-core/i18n'

// Locale routing for the docs content (fumadocs). The landing page's UI
// strings go through best-i18n itself instead - see lib/best-i18n.ts.
export const i18n = defineI18n({
  defaultLanguage: 'en',
  languages: ['en', 'zh'],
  // English lives at the root: /docs, with /zh/docs beside it. `[lang]` is the
  // only tree written by hand; @best-i18n/next-unprefixed-locale mirrors it into
  // `(unprefixed)` with English pinned - see next.config.ts.
  hideLocale: 'default-locale',
})
