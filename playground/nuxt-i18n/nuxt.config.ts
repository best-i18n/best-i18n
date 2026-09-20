export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  modules: ['@nuxtjs/i18n'],
  css: ['~/assets/app.css'],
  i18n: {
    defaultLocale: 'en',
    // The same URL shape as the other playgrounds: English unprefixed,
    // Chinese under /zh.
    strategy: 'prefix_except_default',
    locales: [
      { code: 'en', language: 'en', name: 'English', file: 'en.json' },
      { code: 'zh', language: 'zh', name: '中文', file: 'zh.json' },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'LOCALE',
      redirectOn: 'root',
    },
  },
})
