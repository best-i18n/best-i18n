import { statSync } from 'node:fs'

import { loadCatalog } from '../../compiler/catalog.ts'
import type { LoadedCatalog } from '../../compiler/catalog.ts'
import { transform } from '../../compiler/transform.ts'
import type { TransformOptions } from '../../compiler/transform.ts'

/**
 * Everything the loader needs, and nothing that cannot survive a round trip
 * through JSON: Turbopack serialises loader options, so a RegExp or a function
 * would arrive as an empty object.
 */
export interface I18nLoaderOptions extends Omit<
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
   * This package's version, added by `createI18nPlugin`. Never read - it is
   * here so that upgrading the package changes the loader options, which is
   * the only thing that invalidates Turbopack's cache of a file it has already
   * transformed.
   */
  version?: string
}

/**
 * Rejects a message in a Client Component that reads the ambient locale.
 *
 * Such a message compiles to `getLocale()`, and a client module is rendered
 * twice from two different module graphs: on the server, where nothing has
 * bound the request's locale, and in the browser, where `LocaleProvider` has.
 * The server half therefore falls back to the base locale - so the page is
 * served in the wrong language, flips after hydration, and says nothing about
 * it. React does not even warn: it patches the text and moves on.
 *
 * There is no version of this that works, which is why it is an error and not
 * a warning. React is the one channel both graphs share, so the locale has to
 * come through it: `useI18n()` in the component, or - for a `<Trans>` sitting
 * in JSX - the component the compiler generates for it, which calls the hook
 * itself.
 *
 * The compiler reports what it could not bind (`clientUnbound`); this decides
 * what that means, which is a Next.js question rather than a compiler one.
 */
export function clientModuleError(options: {
  filename: string
  unbound: Array<{ text: string; line: number }>
}): string | undefined {
  const { filename, unbound } = options

  if (unbound.length === 0) return undefined

  const where = unbound
    .map((message) => `    ${filename}:${message.line}  "${message.text}"`)
    .join('\n')

  return (
    `best-i18n: a Client Component has to take its locale from the hook, or ` +
    `the server renders it in the base language and the browser silently ` +
    `disagrees.\n\n` +
    `  const t = useI18n()\n\n` +
    `${where}\n\n` +
    `  A <Trans> among JSX children (or returned as it is) needs nothing: the ` +
    `compiler gives it a component of its own to call the hook from. One ` +
    `used as a string - a prop like \`alt\`, a template literal - cannot ` +
    `have that, because a component renders to an element.\n\n` +
    `  If this file is never server-rendered, move the message inside a ` +
    `component and use the hook there anyway - a message read at module ` +
    `scope is resolved once, for every request.`
  )
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
// oxlint-disable oxc/no-this-in-exported-function -- the loader context
// arrives as `this`; that is the contract, spelled out below.
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
    const { catalog, plurals, files } = catalogFor(options)

    // Without this a translator's edit only shows up after a cold restart.
    for (const file of files) this.addDependency?.(file)

    result = transform(code, this.resourcePath, {
      ...options,
      catalog,
      plurals,
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

  const violation = clientModuleError({
    filename: this.resourcePath,
    unbound: result.clientUnbound,
  })

  if (violation !== undefined) {
    this.callback(new Error(violation))
    return
  }

  for (const { text, locale } of result.missing) {
    this.emitWarning?.(
      new Error(`best-i18n: missing ${locale} translation for "${text}"`),
    )
  }

  this.callback(null, result.code, result.map)
}
