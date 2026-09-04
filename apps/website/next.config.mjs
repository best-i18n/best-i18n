import { fileURLToPath } from 'node:url'
import { createI18nPlugin } from 'best-i18n/next'
import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()

const withI18n = createI18nPlugin({
  messagesDir: fileURLToPath(new URL('./messages', import.meta.url)),
  locales: ['en', 'zh'],
  baseLocale: 'en',
})

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  reactStrictMode: true,
}

export default withI18n(withMDX(config))
