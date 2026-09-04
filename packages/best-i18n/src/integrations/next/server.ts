import { AsyncLocalStorage } from 'node:async_hooks'
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external.js'
import { headers } from 'next/headers'
import { cache } from 'react'

import { setRequestLocaleSource } from '../../runtime/index.ts'
import { getI18nConfig, LOCALE_HEADER } from './config.ts'

import type { Locale } from '../../runtime/index.ts'
import type { NextI18nConfig } from './config.ts'

/**
 * An explicit binding for the current segment, when something wants to override
 * what the URL says.
 *
 * `cache()` is per render, and in the App Router a layout and the page beneath
 * it are separate renders, so this does not reach across segments. That is why
 * it is the override and not the mechanism.
 */
const requestStore = cache((): { locale?: Locale } => ({}))

/**
 * The locale of the render in progress, read straight out of Next's own store.
 *
 * `t` compiles to a synchronous locale check - that is the whole point, no
 * runtime lookup - so the async `params` and `headers()` cannot serve it, and
 * no per-request store of ours survives from one segment to the next. Next's
 * does, and it is already in scope for every Server Component being rendered.
 *
 * The `[locale]` route param is preferred over the header because it is also
 * present while prerendering, where there is no request at all.
 */
function localeFromRender(): Locale | undefined {
  const store = workUnitAsyncStorage.getStore()
  if (store === undefined) return undefined

  const config = getI18nConfig()
  const known = (locale: string | undefined | null): Locale | undefined =>
    locale !== undefined &&
    locale !== null &&
    (config === undefined || config.locales.includes(locale))
      ? locale
      : undefined

  return (
    known(store.rootParams?.[config?.localeParam ?? 'locale']) ??
    known(store.headers?.get(LOCALE_HEADER))
  )
}

/**
 * The binding for code that runs outside a React render, where neither of the
 * stores above exists: statically prerendered route handlers, above all. The
 * proxy is no help there either - during `next build` there is no request.
 *
 * `setRequestLocale` binds it per async context via `enterWith`, so concurrent
 * prerenders in the same worker cannot see each other's locale - the same
 * reason `best-i18n/server` refuses a module-level variable.
 *
 * An explicit binding outranks the URL: the chain consults it before the
 * `[locale]` route param.
 */
const localeStorage = new AsyncLocalStorage<{ locale: Locale }>()

setRequestLocaleSource(
  () =>
    requestStore().locale ??
    localeStorage.getStore()?.locale ??
    localeFromRender(),
)

/**
 * Pins the locale for the code that follows, overriding the URL.
 *
 * Rarely needed: a Server Component reads the locale on its own. Reach for it
 * when a route decides its own language - a preview, an embed, a per-user
 * setting resolved from the database - or in a route handler, where nothing
 * else knows the locale at all.
 *
 * Inside a render the pin lives in React's per-segment cache, exactly as
 * before. Outside one - a statically prerendered route handler, where that
 * cache returns a fresh object per call and a write is lost immediately - it
 * binds the current async context instead, so the pin holds for the rest of
 * the handler without a wrapper. Calling `requestStore()` twice tells the two
 * worlds apart: a working cache hands back the same object.
 */
export function setRequestLocale(locale: Locale): void {
  const store = requestStore()
  if (store === requestStore()) {
    store.locale = locale
  } else {
    localeStorage.enterWith({ locale })
  }
}

/**
 * The locale in effect for this render.
 *
 * Synchronous, and safe to call from anywhere inside a Server Component. Use
 * it for `<html lang>` and for `LocaleProvider`; `t` does not need it.
 */
export function getLocale(config?: NextI18nConfig): Locale {
  const resolved =
    requestStore().locale ??
    localeStorage.getStore()?.locale ??
    localeFromRender()
  if (resolved !== undefined) return resolved

  const fallback = config ?? getI18nConfig()
  if (fallback === undefined) {
    throw new Error(
      'best-i18n: no locale for this render and no config to fall back on. ' +
        'Call defineI18nConfig() in a module the app imports, and make sure ' +
        'the route sits under the [locale] segment or the proxy matcher.',
    )
  }

  return fallback.baseLocale
}

/**
 * The locale for a request that is not under the `[locale]` segment - a route
 * handler, say, where the proxy header is the only source.
 */
export async function getRequestLocale(
  config?: NextI18nConfig,
): Promise<Locale> {
  const resolved =
    requestStore().locale ??
    localeStorage.getStore()?.locale ??
    localeFromRender()
  if (resolved !== undefined) return resolved

  const fallback = config ?? getI18nConfig()
  const store = await headers()
  const fromProxy = store.get(LOCALE_HEADER)

  if (fromProxy !== null && fallback?.locales.includes(fromProxy) !== false) {
    return fromProxy
  }

  return fallback?.baseLocale ?? 'en'
}
