import { fileURLToPath } from 'node:url'
import { createI18nPlugin } from 'best-i18n/next'
import { createMDX } from 'fumadocs-mdx/next'

import { i18nConfig } from './src/lib/best-i18n'

import type { NextConfig } from 'next'

const withMDX = createMDX()

const withI18n = createI18nPlugin({
  // The loader compiles per-locale ternaries, so it needs the values at build
  // time - spreading src/lib/best-i18n.ts is what keeps them defined once.
  ...i18nConfig,
  messagesDir: fileURLToPath(new URL('./messages', import.meta.url)),
})

const config: NextConfig = {
  output: 'export',
  reactStrictMode: true,
}

export default withI18n(withMDX(config))
