import path from 'node:path'
import { loadCatalog } from '../compiler/catalog.ts'
import { transform } from '../compiler/transform.ts'
import type { Plugin } from 'vite'
import type { TransformOptions } from '../compiler/transform.ts'

export interface I18nPluginOptions extends Omit<
  TransformOptions,
  'catalog' | 'plurals' | 'staticLocale'
> {
  /** Directory holding `messages.pot` and `<locale>.po`. */
  messagesDir: string
  /**
   * Emit only this locale and drop the runtime lookup (per-locale build).
   * Typically driven by an env var so one config can build every locale.
   */
  staticLocale?: string | undefined
  /**
   * Files to compile. Defaults to JS/TS, plus `.svelte` when `svelte` is
   * set and `.vue` when `vue` is set. Query-string virtual modules
   * (`*.svelte?type=style`, `*.vue?vue&type=style`) are skipped even when
   * they match.
   */
  include?: RegExp
  /**
   * Compile macros in `.svelte` files. Requires the `svelte` package.
   * Off by default so a project that never uses Svelte does not match those
   * files. `.svelte.ts` / `.svelte.js` rune modules are ordinary JS/TS and
   * do not need this. Has no effect when `include` is set: that pattern is
   * the whole filter.
   */
  svelte?: boolean
  /**
   * Compile macros in `.vue` files, and read the locale through
   * `best-i18n/vue` in every file so composables track it too. Requires the
   * `vue` package. Off by default so a project that never uses Vue does not
   * match those files. Has no effect on the filter when `include` is set.
   */
  vue?: boolean
}

/**
 * Vite plugin, and with it every Vite-based framework - TanStack Start, React
 * Router, SvelteKit, Astro. Next.js has its own integration in
 * `best-i18n/next`, because it does not run on Vite.
 */
export function i18n(options: I18nPluginOptions): Plugin {
  const extensions = [
    '[cm]?[jt]sx?',
    ...(options.svelte === true ? ['svelte'] : []),
    ...(options.vue === true ? ['vue'] : []),
  ]
  const include =
    options.include ?? new RegExp(`\\.(?:${extensions.join('|')})$`)
  const load = () =>
    loadCatalog({
      messagesDir: options.messagesDir,
      locales: options.locales,
      baseLocale: options.baseLocale,
    })

  let { catalog, plurals } = load()

  return {
    name: 'best-i18n',
    enforce: 'pre',

    configureServer(server) {
      // Editing a message file must invalidate everything that inlined it.
      // Resolved because chokidar reports absolute paths - a relative
      // `messagesDir` would otherwise never match and hot reload would
      // silently stop working.
      const dir = path.resolve(options.messagesDir)

      const reload = (file: string) => {
        if (path.relative(dir, file).startsWith('..')) return
        try {
          ;({ catalog, plurals } = load())
        } catch (error) {
          // A half-saved or deleted .po must not crash the dev server; keep
          // serving the last good catalog and say why.
          server.config.logger.error(
            `best-i18n: failed to reload catalogs after a change to ${file}: ` +
              `${(error as Error).message}`,
          )
          return
        }
        server.moduleGraph.invalidateAll()
        server.ws.send({ type: 'full-reload' })
      }

      server.watcher.add(dir)
      // `add`/`unlink` matter too: creating zh.po for the first time, or a
      // TMS sync replacing files wholesale, should reload like an edit.
      server.watcher.on('change', reload)
      server.watcher.on('add', reload)
      server.watcher.on('unlink', reload)
    },

    transform(code, id) {
      const [filename, query] = id.split('?')
      // Virtual style/raw/url modules are not component source.
      if (
        (filename?.endsWith('.svelte') || filename?.endsWith('.vue')) &&
        query !== undefined
      ) {
        return null
      }
      if (!include.test(filename ?? id)) return null

      const result = transform(code, id, {
        ...options,
        catalog,
        plurals,
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
