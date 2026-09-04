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
 */
export function createI18nPlugin(options: I18nLoaderOptions) {
  const use = {
    loader: LOADER,
    options: { ...serializable(options), version: packageVersion() },
  }

  return function withI18n<T extends NextConfigLike>(nextConfig: T): T {
    return {
      ...nextConfig,

      turbopack: {
        ...nextConfig.turbopack,
        rules: {
          ...nextConfig.turbopack?.rules,
          [TURBOPACK_GLOB]: {
            // `foreign` is Turbopack's name for node_modules and its own
            // internals; running a macro transform over those is pure cost.
            condition: { not: 'foreign' },
            loaders: [use],
          },
        },
      },

      webpack(config: any, context: any) {
        const merged = nextConfig.webpack?.(config, context) ?? config

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
