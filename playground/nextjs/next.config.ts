import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createI18nPlugin } from 'best-i18n/next'

import type { NextConfig } from 'next'

const withI18n = createI18nPlugin({
  messagesDir: fileURLToPath(new URL('./messages', import.meta.url)),
  locales: ['en', 'zh'],
  baseLocale: 'en',
  // Set it to build one locale as plain string literals, with no locale
  // branch and no runtime left in the bundle: `I18N_STATIC_LOCALE=zh next build`.
  staticLocale: process.env.I18N_STATIC_LOCALE,
})

const nextConfig: NextConfig = {}

export default withI18n(nextConfig)
