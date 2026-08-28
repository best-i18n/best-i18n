import { loadCatalog } from '../compiler/catalog.ts'
import { transform } from '../compiler/transform.ts'

import type { Plugin } from 'vite'
import type { TransformOptions } from '../compiler/transform.ts'

export interface I18nPluginOptions extends Omit<
  TransformOptions,
  'catalog' | 'staticLocale'
> {
  /** Directory holding `messages.pot` and `<locale>.po`. */
  messagesDir: string
  /**
   * Emit only this locale and drop the runtime lookup (per-locale build).
   * Typically driven by an env var so one config can build every locale.
   */
  staticLocale?: string | undefined
  include?: RegExp
}

/**
 * Vite plugin, and with it every Vite-based framework - TanStack Start, React
 * Router, SvelteKit, Astro. Next.js has its own integration in
 * `best-i18n/next`, because it does not run on Vite.
 */
export function i18n(options: I18nPluginOptions): Plugin {
  const include = options.include ?? /\.[jt]sx?$/
  const load = () =>
    loadCatalog({
      messagesDir: options.messagesDir,
      locales: options.locales,
      baseLocale: options.baseLocale,
    })

  let { catalog } = load()

  return {
    name: 'best-i18n',
    enforce: 'pre',

    configureServer(server) {
      // Editing a message file must invalidate everything that inlined it.
      server.watcher.add(options.messagesDir)
      server.watcher.on('change', (file) => {
        if (!file.startsWith(options.messagesDir)) return
        catalog = load().catalog
        server.moduleGraph.invalidateAll()
        server.ws.send({ type: 'full-reload' })
      })
    },

    transform(code, id) {
      if (!include.test(id.split('?')[0] ?? id)) return null

      const result = transform(code, id, {
        ...options,
        catalog,
        staticLocale: options.staticLocale,
      })

      if (result === null) return null

      for (const { text, locale } of result.missing) {
        this.warn(`missing ${locale} translation for "${text}"`)
      }

      return { code: result.code, map: result.map }
    },
  }
}
