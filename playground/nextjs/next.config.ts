import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createI18nPlugin } from 'best-i18n/next'

import { i18n } from './src/i18n'

import type { NextConfig } from 'next'

const withI18n = createI18nPlugin({
  // The loader compiles per-locale ternaries, so it needs the values at build
  // time - spreading src/i18n.ts is what keeps them defined once, rather than
  // repeating the locales here.
  ...i18n,
  messagesDir: fileURLToPath(new URL('./messages', import.meta.url)),
  // Set it to build one locale as plain string literals, with no locale
  // branch and no runtime left in the bundle: `I18N_STATIC_LOCALE=zh next build`.
  staticLocale: process.env.I18N_STATIC_LOCALE,
})

const nextConfig: NextConfig = {}

export default withI18n(nextConfig)
