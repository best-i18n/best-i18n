import { AsyncLocalStorage } from 'node:async_hooks'

import { resolveLocale } from '../request.ts'
import { setRequestLocaleSource } from './index.ts'

import type { RequestConfig } from '../request.ts'
import type { Locale } from './index.ts'

interface RequestStore {
  locale: Locale
}

/**
 * Per-request locale on the server.
 *
 * Deliberately not lazily created with a synchronous fallback: a shared
 * module-level variable would leak one request's locale into another concurrent
 * request, silently and only under load. Failing at import time is better.
 */
function createStore(): AsyncLocalStorage<RequestStore> {
  if (typeof AsyncLocalStorage !== 'function') {
    throw new TypeError(
      'best-i18n: AsyncLocalStorage is unavailable. Per-request locale ' +
        'isolation cannot be guaranteed, refusing to fall back to a shared ' +
        'variable. On Cloudflare Workers enable the `nodejs_compat` flag.',
    )
  }

  return new AsyncLocalStorage<RequestStore>()
}

const serverStore = createStore()

setRequestLocaleSource(() => serverStore.getStore()?.locale)

/** Runs `fn` with `locale` bound to the current async context. */
export function withLocale<T>(locale: Locale, fn: () => T): T {
  return serverStore.run({ locale }, fn)
}

/**
 * Resolves the locale for a request and binds it to the async context.
 *
 * The entry point for any server that owns its request handler - a Vite-based
 * framework, a Worker, a plain fetch handler. Next.js does not hand that
 * handler over, so it has its own binding in `best-i18n/next/server`.
 */
export function withRequestLocale<T>(
  request: Request,
  config: RequestConfig,
  fn: () => T,
): T {
  return withLocale(resolveLocale(request, config), fn)
}
