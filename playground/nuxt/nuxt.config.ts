import process from 'node:process'
import i18nConfig from './i18n.config'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  modules: ['best-i18n/nuxt'],
  css: ['~/assets/app.css'],
  bestI18n: {
    // The module needs them itself; the rest of i18n.config.ts reaches the
    // compiler through the Vite plugin it installs.
    locales: i18nConfig.locales,
    baseLocale: i18nConfig.baseLocale,
    // Set (e.g. from an env var) to build a single locale as pure literals.
    staticLocale: process.env.I18N_STATIC_LOCALE || undefined,
  },
})
