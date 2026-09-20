import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { solidStart } from '@solidjs/start/config'
import { i18n } from 'best-i18n/vite'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'
import { i18n as localeConfig } from './src/i18n.ts'

export default defineConfig({
  define: {
    'import.meta.env.I18N_STATIC_LOCALE': JSON.stringify(
      process.env.I18N_STATIC_LOCALE ?? '',
    ),
  },
  plugins: [
    i18n({
      messagesDir: fileURLToPath(new URL('./messages', import.meta.url)),
      locales: localeConfig.locales,
      baseLocale: localeConfig.baseLocale,
      staticLocale: process.env.I18N_STATIC_LOCALE || undefined,
      solid: true,
    }),
    solidStart({ middleware: './src/middleware.ts' }),
    nitro(),
  ],
})
