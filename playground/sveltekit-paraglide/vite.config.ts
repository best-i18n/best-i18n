import { fileURLToPath } from 'node:url'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 3000 },
  preview: { port: 3000 },
  plugins: [
    paraglideVitePlugin({
      project: fileURLToPath(new URL('./project.inlang', import.meta.url)),
      outdir: fileURLToPath(new URL('./src/lib/paraglide', import.meta.url)),
      outputStructure: 'message-modules',
      strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],
      urlPatterns: [
        // The catch-all alone does not match a bare `/zh`, so the root needs
        // its own pattern - the same list the TanStack playground uses.
        {
          pattern: '/',
          localized: [
            ['en', '/'],
            ['zh', '/zh'],
          ],
        },
        {
          pattern: '/about',
          localized: [
            ['en', '/about'],
            ['zh', '/zh/about'],
          ],
        },
        {
          pattern: '/:path(.*)?',
          localized: [
            ['en', '/:path(.*)?'],
            ['zh', '/zh/:path(.*)?'],
          ],
        },
      ],
    }),
    sveltekit(),
  ],
})
