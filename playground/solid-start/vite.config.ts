import process from 'node:process'
import { solidStart } from '@solidjs/start/config'
import { i18n } from 'best-i18n/vite'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  define: {
    'import.meta.env.I18N_STATIC_LOCALE': JSON.stringify(
      process.env.I18N_STATIC_LOCALE ?? '',
    ),
  },
  plugins: [
    // Locales and the catalog directory come from i18n.config.ts.
    i18n({
      staticLocale: process.env.I18N_STATIC_LOCALE || undefined,
      solid: true,
    }),
    solidStart({ middleware: './src/middleware.ts' }),
    nitro(),
  ],
})
