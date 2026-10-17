import process from 'node:process'
import { createI18nPlugin } from 'best-i18n/next'
import type { NextConfig } from 'next'

// Locales and the catalog directory come from i18n.config.ts, which
// src/i18n.ts reads as well - written once for the build and the app.
const withI18n = createI18nPlugin({
  // Set it to build one locale as plain string literals, with no locale
  // branch and no runtime left in the bundle: `I18N_STATIC_LOCALE=zh next build`.
  staticLocale: process.env.I18N_STATIC_LOCALE,
})

const nextConfig: NextConfig = {}

export default withI18n(nextConfig)
