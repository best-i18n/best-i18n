import { describe, expect, it, vi } from 'vitest'

import './helpers/install-als-global.ts'

import type { AsyncLocalStorage } from 'node:async_hooks'

/**
 * The other half of next-server.test.ts: here React's `cache()` memoizes, the
 * way it does inside a render, so `setRequestLocale` takes the per-segment
 * cache path instead of the AsyncLocalStorage one. One memo for the whole
 * file plays the part of one render pass.
 */
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  const memo = new Map<unknown, unknown>()

  return {
    ...actual,
    cache<T extends (...args: never[]) => unknown>(fn: T): T {
      return ((...args: never[]) => {
        if (!memo.has(fn)) memo.set(fn, fn(...args))
        return memo.get(fn)
      }) as T
    },
  }
})

const { workUnitAsyncStorage } =
  await import('next/dist/server/app-render/work-unit-async-storage.external.js')
const { defineI18nConfig } = await import('../src/integrations/next/config.ts')
const { getLocale, setRequestLocale } =
  await import('../src/integrations/next/server.ts')

defineI18nConfig({ locales: ['en', 'zh'], baseLocale: 'en' })

describe('setRequestLocale inside a render', () => {
  it('writes the pin to the render cache, visible across async frames', async () => {
    setRequestLocale('zh')

    expect(getLocale()).toBe('zh')

    // The cache store is shared across the whole render, unlike the
    // AsyncLocalStorage binding, which an unrelated frame would not see.
    await (async () => {
      await Promise.resolve()
      expect(getLocale()).toBe('zh')
    })()
  })

  it('outranks the route param', () => {
    setRequestLocale('zh')

    const storage =
      workUnitAsyncStorage as unknown as AsyncLocalStorage<unknown>
    storage.run({ rootParams: { locale: 'en' } }, () => {
      expect(getLocale()).toBe('zh')
    })
  })
})
