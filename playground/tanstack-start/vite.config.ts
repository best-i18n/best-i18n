import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { i18n } from 'best-i18n/vite'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    // The same plugin every Vite-based framework uses; nothing here is
    // TanStack-specific.
    i18n({
      messagesDir: fileURLToPath(new URL('./messages', import.meta.url)),
      locales: ['en', 'zh'],
      baseLocale: 'en',
      staticLocale: process.env.I18N_STATIC_LOCALE,
    }),
    tanstackStart(),
    // react's plugin has to come after start's
    viteReact(),
    // Turns the built handler into a server that actually listens.
    nitro(),
  ],
})
