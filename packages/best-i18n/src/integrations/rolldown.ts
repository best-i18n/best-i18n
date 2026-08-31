import { loadCatalog } from '../compiler/catalog.ts'
import { macroSpecifiers, transform } from '../compiler/transform.ts'

import type { Plugin } from 'rolldown'
import type { LoadedCatalog } from '../compiler/catalog.ts'
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
  include?: RegExp
}

function escapeRegExp(value: string): string {
  return value.replace(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)
}

/**
 * Standalone Rolldown plugin, for Rolldown used directly and for the tools
 * built on it (tsdown and friends). Vite - including rolldown-vite, which
 * keeps the Vite plugin API - takes `best-i18n/vite` instead; Next.js has its
 * own integration in `best-i18n/next`.
 *
 * The hook filters below run in Rust: a file that does not name a macro
 * module never reaches JavaScript at all, which on a large tree is most
 * files. The handler re-checks both conditions, so the filters are purely an
 * optimization, never a correctness dependency.
 */
export function i18n(options: I18nPluginOptions): Plugin {
  const include = options.include ?? /\.[cm]?[jt]sx?$/
  const load = () =>
    loadCatalog({
      messagesDir: options.messagesDir,
      locales: options.locales,
      baseLocale: options.baseLocale,
    })

  let loaded: LoadedCatalog | undefined

  return {
    name: 'best-i18n',

    // Runs on every (re)build, which is what keeps watch mode honest: a
    // translator's edit reloads the catalogs here, and the modules that
    // inlined a message re-transform because they declared the catalog files
    // as watch dependencies below.
    buildStart() {
      try {
        loaded = load()
      } catch (error) {
        // A half-saved .po must not kill a watch rebuild; keep the last good
        // catalogs and say why. The very first build has nothing to fall
        // back on, so there the error is real.
        if (loaded === undefined) throw error
        this.warn(
          'best-i18n: failed to reload catalogs, keeping the previous ones: ' +
            `${(error as Error).message}`,
        )
      }
    },

    transform: {
      filter: {
        id: { include: [include] },
        // A macro has to be imported to be used, so a file that names none of
        // these modules cannot contain a message.
        code: {
          include: macroSpecifiers(options).map(
            (specifier) => new RegExp(escapeRegExp(specifier)),
          ),
        },
      },
      handler(code, id) {
        if (!include.test(id.split('?')[0] ?? id)) return null

        const { catalog, plurals, files } = (loaded ??= load())

        const result = transform(code, id, {
          ...options,
          catalog,
          plurals,
          staticLocale: options.staticLocale,
        })

        if (result === null) return null

        // Editing a message file must re-transform everything that inlined it.
        for (const file of files) this.addWatchFile(file)

        for (const { text, locale } of result.missing) {
          this.warn(`missing ${locale} translation for "${text}"`)
        }

        return { code: result.code, map: result.map }
      },
    },
  }
}
