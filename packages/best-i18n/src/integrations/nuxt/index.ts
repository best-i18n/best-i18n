import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  addPlugin,
  addServerPlugin,
  addVitePlugin,
  defineNuxtModule,
} from '@nuxt/kit'
import { i18n } from '../vite.ts'
import type { NuxtModule } from '@nuxt/schema'
import type { RequestConfig } from '../../request.ts'

export interface ModuleOptions extends RequestConfig {
  /**
   * Directory holding `messages.pot` and `<locale>.po`, relative to the
   * project root.
   *
   * @default 'messages'
   */
  messagesDir?: string
  /**
   * Emit only this locale and drop the runtime lookup (per-locale build).
   * Typically driven by an env var so one config can build every locale;
   * the server then answers every request in this locale too.
   */
  staticLocale?: string | undefined
}

/** What the runtime plugins read back from `runtimeConfig.public.bestI18n`. */
export interface PublicConfig extends RequestConfig {
  staticLocale?: string | undefined
}

/**
 * The runtime halves of the module live next to this file: a Nitro plugin
 * that binds the locale to each request, and a Nuxt plugin that stamps
 * `<html lang>` on the server and picks the locale up before hydration on
 * the client. Nuxt loads them by path, so the built files are pointed at
 * directly, with the source spelling as the fallback for running unbuilt.
 */
function sibling(built: string, source: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  for (const name of [built, source]) {
    const candidate = path.join(here, name)
    if (existsSync(candidate)) return candidate
  }
  return path.join(here, built)
}

/**
 * Nuxt 4: the Vite plugin with `vue: true`, one route per locale, and the
 * request binding done through Nitro's async context rather than a
 * middleware - Nuxt's middleware cannot wrap the render, but every request
 * already runs inside an `AsyncLocalStorage` once `asyncContext` is on.
 *
 * @example
 *   // nuxt.config.ts
 *   export default defineNuxtConfig({
 *     modules: ['best-i18n/nuxt'],
 *     bestI18n: { locales: ['en', 'zh'], baseLocale: 'en' },
 *   })
 */
const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'best-i18n',
    configKey: 'bestI18n',
    compatibility: { nuxt: '>=3.13.0' },
  },
  // No array in the defaults: Nuxt merges options with `defu`, which
  // concatenates arrays, so a default `locales` would be appended to the
  // user's list rather than replaced by it.
  defaults: {
    baseLocale: 'en',
    messagesDir: 'messages',
  },
  setup(options, nuxt) {
    const { messagesDir = 'messages', staticLocale, ...request } = options
    if (!Array.isArray(options.locales) || options.locales.length === 0) {
      throw new TypeError(
        'best-i18n/nuxt: `bestI18n.locales` must list every locale, e.g. ' +
          "['en', 'zh'].",
      )
    }
    const publicConfig: PublicConfig = {
      ...request,
      ...(staticLocale === undefined ? {} : { staticLocale }),
    }

    // `useEvent()` - and with it the per-request locale - needs Nitro's
    // async context. Nuxt turns it on for both halves with one flag.
    nuxt.options.experimental.asyncContext = true
    nuxt.options.runtimeConfig.public.bestI18n = publicConfig

    addVitePlugin(
      i18n({
        messagesDir: path.resolve(nuxt.options.rootDir, messagesDir),
        locales: options.locales,
        baseLocale: options.baseLocale,
        staticLocale,
        vue: true,
      }),
    )

    // `/zh/about` is `/about` under another prefix: give every page a copy
    // per non-base locale instead of rewriting URLs at request time.
    nuxt.hook('pages:extend', (pages) => {
      const prefixed = options.locales.filter(
        (locale) => locale !== options.baseLocale,
      )
      // A snapshot: the loop appends to `pages` and must not see its own work.
      // Dynamic routes are copied too - `/zh/posts/:slug` next to
      // `/posts/:slug`; a literal `/zh` segment outranks a parameter in the
      // router, so the prefixed copy wins for `/zh/...` and the original for
      // everything else.
      for (const page of pages.slice()) {
        if (page.path === undefined) continue
        for (const locale of prefixed) {
          pages.push({
            ...page,
            name:
              page.name === undefined ? undefined : `${locale}/${page.name}`,
            path: page.path === '/' ? `/${locale}` : `/${locale}${page.path}`,
          })
        }
      }
    })

    // Prerendering crawls from `/` and follows links, and the English pages
    // link only to English pages: the locale switcher is a button. Seed the
    // crawl with each prefixed root, and it finds the rest of that locale.
    nuxt.hook('prerender:routes', ({ routes }) => {
      for (const locale of options.locales) {
        if (locale !== options.baseLocale) routes.add(`/${locale}`)
      }
    })

    addServerPlugin(sibling('nuxt-server-plugin.mjs', 'server-plugin.ts'))
    addPlugin({ src: sibling('nuxt-plugin.mjs', 'plugin.ts') })
  },
})

export default module
