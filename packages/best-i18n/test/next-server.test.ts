import { describe, expect, it } from 'vitest'

import './helpers/install-als-global.ts'

import type { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Outside a React render - which is what this plain Node process is - React's
 * `cache()` hands back a fresh object per call, so these tests exercise the
 * paths a statically prerendered route handler takes: the AsyncLocalStorage
 * binding behind `setRequestLocale`, and the `rootParams` fallback read
 * through Next's own store.
 *
 * Everything that evaluates `next/dist/server/*` is imported dynamically, so
 * the install-als-global helper above has run first - otherwise Next creates
 * its storages as fakes whose `run()` throws.
 */
const { workUnitAsyncStorage } =
  await import('next/dist/server/app-render/work-unit-async-storage.external.js')
const { defineI18nConfig } = await import('../src/integrations/next/config.ts')
const { getLocale, getRequestLocale, setRequestLocale } =
  await import('../src/integrations/next/server.ts')
const { getLocale: runtimeGetLocale } = await import('../src/runtime/index.ts')

const config = defineI18nConfig({
  locales: ['en', 'zh'],
  baseLocale: 'en',
})

/**
 * Runs `fn` in an async frame of its own, the way a route handler is invoked.
 *
 * This is load-bearing: `enterWith` binds the remainder of the current
 * synchronous execution, so calling `setRequestLocale` directly in the test
 * runner's frame would leak the binding into every later test. One `await`
 * first puts `fn` in a frame the runner never returns to.
 */
async function isolated<T>(fn: () => T | Promise<T>): Promise<T> {
  await Promise.resolve()
  return fn()
}

function fakeRender<T>(rootParams: Record<string, string>, fn: () => T): T {
  // The real storage instance Next renders with; a minimal store is enough
  // for localeFromRender, which only reads `rootParams` and `headers`. The
  // package's own declaration for it stops at `getStore`, hence the cast.
  const storage = workUnitAsyncStorage as unknown as AsyncLocalStorage<unknown>
  return storage.run({ rootParams }, fn)
}

describe('setRequestLocale outside a render', () => {
  it('binds the locale for the code that follows', async () => {
    await isolated(() => {
      expect(getLocale()).toBe('en')

      setRequestLocale('zh')

      expect(getLocale()).toBe('zh')
      // The compiled `t` reads the runtime getLocale - same answer.
      expect(runtimeGetLocale()).toBe('zh')
    })
  })

  it('holds across awaits within the same handler', async () => {
    await isolated(async () => {
      setRequestLocale('zh')
      await new Promise((resolve) => setTimeout(resolve, 5))
      expect(getLocale()).toBe('zh')
    })
  })

  it('keeps concurrent handlers isolated', async () => {
    const settle = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms))

    const results = await Promise.all([
      isolated(async () => {
        setRequestLocale('zh')
        await settle(20)
        return getLocale()
      }),
      isolated(async () => {
        setRequestLocale('en')
        await settle(5)
        return getLocale()
      }),
    ])

    expect(results).toEqual(['zh', 'en'])
  })

  it('lets a later call override an earlier one', async () => {
    await isolated(() => {
      setRequestLocale('zh')
      expect(getLocale()).toBe('zh')
      setRequestLocale('en')
      expect(getLocale()).toBe('en')
    })
  })

  it('does not outlive its async frame', async () => {
    await isolated(() => setRequestLocale('zh'))

    expect(getLocale()).toBe(config.baseLocale)
  })

  it('outranks the route param - explicit beats ambient', async () => {
    await isolated(() => {
      fakeRender({ locale: 'en' }, () => {
        setRequestLocale('zh')
        expect(getLocale()).toBe('zh')
      })
    })
  })

  it('serves getRequestLocale without a request', async () => {
    // A bound locale short-circuits before headers(), which would throw here.
    await isolated(async () => {
      setRequestLocale('zh')
      expect(await getRequestLocale()).toBe('zh')
    })
  })
})

describe('localeFromRender', () => {
  it('reads the [locale] route param from the render store', () => {
    fakeRender({ locale: 'zh' }, () => {
      expect(getLocale()).toBe('zh')
      expect(runtimeGetLocale()).toBe('zh')
    })
  })

  it('rejects a param value that is not a configured locale', () => {
    fakeRender({ locale: 'fr' }, () => {
      expect(getLocale()).toBe(config.baseLocale)
    })
  })

  it('honours a custom localeParam', () => {
    defineI18nConfig({
      locales: ['en', 'zh'],
      baseLocale: 'en',
      localeParam: 'lang',
    })

    try {
      fakeRender({ lang: 'zh' }, () => {
        expect(getLocale()).toBe('zh')
      })
      // The default param name is no longer consulted.
      fakeRender({ locale: 'zh' }, () => {
        expect(getLocale()).toBe('en')
      })
    } finally {
      defineI18nConfig({ locales: ['en', 'zh'], baseLocale: 'en' })
    }
  })
})
