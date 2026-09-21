import process from 'node:process'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  modules: ['best-i18n/nuxt'],
  css: ['~/assets/app.css'],
  bestI18n: {
    locales: ['en', 'zh'],
    baseLocale: 'en',
    // Set (e.g. from an env var) to build a single locale as pure literals.
    staticLocale: process.env.I18N_STATIC_LOCALE || undefined,
  },
})
