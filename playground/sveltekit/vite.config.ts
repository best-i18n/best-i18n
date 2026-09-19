import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { sveltekit } from '@sveltejs/kit/vite'
import { i18n } from 'best-i18n/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 3000 },
  preview: { port: 3000 },
  plugins: [
    // Compile macros in .svelte files before SvelteKit's plugin sees them.
    i18n({
      messagesDir: fileURLToPath(new URL('./messages', import.meta.url)),
      locales: ['en', 'zh'],
      baseLocale: 'en',
      staticLocale: process.env.I18N_STATIC_LOCALE,
      svelte: true,
    }),
    sveltekit(),
  ],
})
