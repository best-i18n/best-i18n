import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { I18nLoaderOptions } from './loader.ts'

export type { I18nLoaderOptions }

/**
 * The parts of `NextConfig` this plugin touches, declared structurally rather
 * than imported from `next`: the package is an optional peer dependency, and a
 * `.d.ts` that hard-requires it would break every consumer who is not on
 * Next.js.
 */
export interface NextConfigLike {
  turbopack?: { rules?: Record<string, any> } | undefined
  webpack?: ((config: any, context: any) => any) | null | undefined
  output?: string | undefined
  pageExtensions?: string[] | undefined
}

/** What a plugin is handed: everything `createI18nPlugin` was given. */
export interface NextI18nPluginContext {
  options: NextI18nPluginOptions
}

/**
 * A step to run while Next loads the config, with the i18n config in hand.
 * This is how something that needs the locales and the URL shape - a route
 * mirror for static exports, say - hooks in without best-i18n knowing about
 * it, and without the app repeating its locales for a second package.
 */
export interface NextI18nPlugin {
  name: string
  /**
   * Runs once per wrapped config, in order, before the loader is registered.
   * Return a config to replace it; return nothing to leave it as is.
   */
  config?: (
    nextConfig: NextConfigLike,
    context: NextI18nPluginContext,
  ) => NextConfigLike | undefined | void
}

export interface NextI18nPluginOptions extends I18nLoaderOptions {
  /**
   * Name of the dynamic segment holding the locale, as in `app/[locale]`.
   * Spread in from `defineI18nConfig`, for plugins that need it.
   *
   * @default 'locale'
   */
  localeParam?: string
  /** Spread in from `defineI18nConfig`, for plugins that need it. */
  prefixBase?: boolean
  /**
   * Steps to run while Next loads the config - see `NextI18nPlugin`. For a
   * static export with the base locale unprefixed, that is `staticExport()`
   * from `@best-i18n/next-unprefixed-locale`.
   */
  plugins?: NextI18nPlugin[]
}

/**
 * Turbopack and webpack both resolve a loader by module path. Pointing at the
 * built file next to this one keeps that independent of how the consumer's
 * resolver treats our `exports` map; the package specifier is the fallback for
 * running straight from source.
 */
function resolveLoader(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))

  for (const name of ['next-loader.mjs', 'next-loader.js', 'loader.ts']) {
    const candidate = path.join(here, name)
    if (existsSync(candidate)) return candidate
  }

  return 'best-i18n/next/loader'
}

const LOADER = resolveLoader()

/**
 * Turbopack caches a loader's output against the file's content and the
 * loader's options, and neither of those changes when the loader itself does.
 * Upgrading this package would otherwise keep serving transforms produced by
 * the version you replaced - silently, and only for files you had not touched.
 * Threading the version through the options is what makes an upgrade a
 * cache miss.
 */
function packageVersion(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url))

  for (let up = 0; up < 5; up++) {
    const manifest = path.join(dir, 'package.json')
    if (existsSync(manifest)) {
      try {
        return (
          (JSON.parse(readFileSync(manifest, 'utf8')) as { version?: string })
            .version ?? '0'
        )
      } catch {
        return '0'
      }
    }
    dir = path.dirname(dir)
  }

  return '0'
}

/**
 * Turbopack rejects loader options it cannot serialize, and an optional field
 * left as `undefined` - `staticLocale` from an env var nobody set, typically -
 * is enough to trip it. Dropping those keys is the difference between the
 * config working and a build error about an option you never passed.
 */
function serializable<T extends object>(options: T): T {
  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  ) as T
}

// Turbopack and webpack disagree about how to spell "not node_modules": a glob
// plus a built-in condition on one side, a test/exclude pair on the other.
// Keep the two extension sets identical, or a file transforms under one
// bundler and reaches runtime under the other.
const TURBOPACK_GLOB = '*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'
const WEBPACK_TEST = /\.[cm]?[jt]sx?$/

/**
 * Wires the message compiler into a Next.js build, under Turbopack and webpack
 * alike. Next.js does not run on Vite, so it needs its own integration; the
 * options are the same as the Vite plugin's.
 *
 * @example
 *   // next.config.ts
 *   import { createI18nPlugin } from 'best-i18n/next'
 *
 *   import { i18n } from './src/i18n'
 *
 *   const withI18n = createI18nPlugin({
 *     ...i18n, // locales and baseLocale, defined once in src/i18n.ts
 *     messagesDir: fileURLToPath(new URL('./messages', import.meta.url)),
 *     staticLocale: process.env.I18N_STATIC_LOCALE,
 *   })
 *
 *   export default withI18n({})
 *
 * @example
 *   // A static export with the base locale unprefixed: /docs beside /zh/docs,
 *   // and no proxy to strip the prefix, so the files have to exist.
 *   import { staticExport } from '@best-i18n/next-unprefixed-locale'
 *
 *   const withI18n = createI18nPlugin({
 *     ...i18n,
 *     messagesDir: fileURLToPath(new URL('./messages', import.meta.url)),
 *     plugins: [staticExport()],
 *   })
 *
 *   export default withI18n({ output: 'export' })
 */
export function createI18nPlugin(options: NextI18nPluginOptions) {
  // Plugins run at config load, not in the loader; Turbopack would otherwise
  // try to serialize them into the loader's cache key.
  const { plugins = [], ...loaderOptions } = options

  const use = {
    loader: LOADER,
    options: { ...serializable(loaderOptions), version: packageVersion() },
  }

  return function withI18n<T extends NextConfigLike>(nextConfig: T): T {
    const context: NextI18nPluginContext = { options }
    const config = plugins.reduce<T>(
      (current, plugin) => (plugin.config?.(current, context) as T) ?? current,
      nextConfig,
    )

    return {
      ...config,

      turbopack: {
        ...config.turbopack,
        rules: {
          ...config.turbopack?.rules,
          [TURBOPACK_GLOB]: {
            // `foreign` is Turbopack's name for node_modules and its own
            // internals; running a macro transform over those is pure cost.
            condition: { not: 'foreign' },
            loaders: [use],
          },
        },
      },

      webpack(webpackConfig: any, webpackContext: any) {
        const merged =
          config.webpack?.(webpackConfig, webpackContext) ?? webpackConfig

        merged.module.rules.push({
          test: WEBPACK_TEST,
          exclude: /node_modules/,
          use: [use],
        })

        return merged
      },
    } as T
  }
}
