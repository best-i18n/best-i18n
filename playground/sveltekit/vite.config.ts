import process from 'node:process'
import { sveltekit } from '@sveltejs/kit/vite'
import { i18n } from 'best-i18n/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 3000 },
  preview: { port: 3000 },
  plugins: [
    // Compile macros in .svelte files before SvelteKit's plugin sees them.
    // Locales and the catalog directory come from i18n.config.ts.
    i18n({
      staticLocale: process.env.I18N_STATIC_LOCALE,
      svelte: true,
    }),
    sveltekit(),
  ],
})
