import { fileURLToPath } from 'node:url'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { solidStart } from '@solidjs/start/config'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    paraglideVitePlugin({
      project: fileURLToPath(new URL('./project.inlang', import.meta.url)),
      outdir: fileURLToPath(new URL('./src/paraglide', import.meta.url)),
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
    solidStart({ middleware: './src/middleware.ts' }),
    nitro(),
  ],
})
