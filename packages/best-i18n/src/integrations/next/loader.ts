import { statSync } from 'node:fs'

import { loadCatalog } from '../../compiler/catalog.ts'
import { transform } from '../../compiler/transform.ts'

import type { LoadedCatalog } from '../../compiler/catalog.ts'
import type { TransformOptions } from '../../compiler/transform.ts'

/**
 * Everything the loader needs, and nothing that cannot survive a round trip
 * through JSON: Turbopack serialises loader options, so a RegExp or a function
 * would arrive as an empty object.
 */
export interface I18nLoaderOptions extends Omit<
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
  /**
   * This package's version, added by `createI18nPlugin`. Never read - it is
   * here so that upgrading the package changes the loader options, which is
   * the only thing that invalidates Turbopack's cache of a file it has already
   * transformed.
   */
  version?: string
}

/** The slice of the webpack loader API Turbopack also implements. */
interface LoaderContext {
  resourcePath: string
  getOptions: () => I18nLoaderOptions
  callback: (error: Error | null, code?: string, map?: unknown) => void
  addDependency?: (file: string) => void
  emitWarning?: (warning: Error) => void
}

interface CacheEntry {
  signature: string
  loaded: LoadedCatalog
}

// One loader instance runs per module, so parsing every PO file per module
// would dominate the build. Keyed by the catalog identity and invalidated on
// mtime, which is what a watch-mode edit changes.
const cache = new Map<string, CacheEntry>()

function signatureOf(files: string[]): string {
  return files
    .map((file) => {
      try {
        return `${file}:${statSync(file).mtimeMs}`
      } catch {
        return `${file}:missing`
      }
    })
    .join('|')
}

function catalogFor(options: I18nLoaderOptions): LoadedCatalog {
  const key = `${options.messagesDir}|${options.baseLocale}|${options.locales.join(',')}`
  const cached = cache.get(key)

  if (
    cached !== undefined &&
    signatureOf(cached.loaded.files) === cached.signature
  ) {
    return cached.loaded
  }

  const loaded = loadCatalog({
    messagesDir: options.messagesDir,
    locales: options.locales,
    baseLocale: options.baseLocale,
  })

  cache.set(key, { signature: signatureOf(loaded.files), loaded })

  return loaded
}

/**
 * Webpack/Turbopack loader that inlines every message, the Next.js counterpart
 * of the Vite plugin. Configured for you by `createI18nPlugin` in
 * `best-i18n/next`; you should not have to name it yourself.
 */
export default function bestI18nLoader(
  this: LoaderContext,
  code: string,
): void {
  let options: I18nLoaderOptions

  try {
    options = this.getOptions()
  } catch (error) {
    this.callback(error as Error)
    return
  }

  let result: ReturnType<typeof transform>

  try {
    const { catalog, files } = catalogFor(options)

    // Without this a translator's edit only shows up after a cold restart.
    for (const file of files) this.addDependency?.(file)

    result = transform(code, this.resourcePath, {
      ...options,
      catalog,
      staticLocale: options.staticLocale,
    })
  } catch (error) {
    this.callback(error as Error)
    return
  }

  if (result === null) {
    this.callback(null, code)
    return
  }

  for (const { text, locale } of result.missing) {
    this.emitWarning?.(
      new Error(`best-i18n: missing ${locale} translation for "${text}"`),
    )
  }

  this.callback(null, result.code, result.map)
}
