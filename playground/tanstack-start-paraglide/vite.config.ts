import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: { '@': path.join(here, 'src') },
  },
  plugins: [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      outputStructure: 'message-modules',
      strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],
      urlPatterns: [
        // The catch-all alone does not match a bare `/zh`, so the root needs
        // its own pattern - the same shape the TanStack example uses.
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
    tanstackStart(),
    viteReact(),
    nitro(),
  ],
})
