import { describe, expect, it } from 'vitest'

import {
  deLocalizePathname,
  localeFromPathname,
  localizePathname,
} from '../src/locale-url.ts'
import { resolveLocale } from '../src/request.ts'

const CONFIG = {
  locales: ['en', 'zh'],
  baseLocale: 'en',
  exclude: /^\/api(\/|$)/,
}

describe('localizePathname / deLocalizePathname', () => {
  it('leaves the base locale unprefixed', () => {
    expect(localizePathname('/about', 'en', CONFIG)).toBe('/about')
    expect(localizePathname('/', 'en', CONFIG)).toBe('/')
  })

  it('prefixes other locales', () => {
    expect(localizePathname('/about', 'zh', CONFIG)).toBe('/zh/about')
    expect(localizePathname('/', 'zh', CONFIG)).toBe('/zh')
  })

  it('is idempotent when the prefix is already there', () => {
    expect(localizePathname('/zh/about', 'zh', CONFIG)).toBe('/zh/about')
    expect(localizePathname('/zh/about', 'en', CONFIG)).toBe('/about')
  })

  it('strips the prefix on the way in', () => {
    expect(deLocalizePathname('/zh/about', CONFIG)).toBe('/about')
    expect(deLocalizePathname('/zh', CONFIG)).toBe('/')
    expect(deLocalizePathname('/about', CONFIG)).toBe('/about')
  })

  it('never localizes excluded paths', () => {
    expect(localizePathname('/api/rpc/listTodos', 'zh', CONFIG)).toBe(
      '/api/rpc/listTodos',
    )
    expect(localizePathname('/api', 'zh', CONFIG)).toBe('/api')
    expect(deLocalizePathname('/api/rpc', CONFIG)).toBe('/api/rpc')
  })

  it('does not confuse a path that merely starts with the locale name', () => {
    expect(deLocalizePathname('/zhuanti', CONFIG)).toBe('/zhuanti')
    expect(localeFromPathname('/zhuanti', CONFIG)).toBe('en')
  })
})

function request(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers })
}

describe('resolveLocale', () => {
  it('prefers the URL prefix', () => {
    expect(
      resolveLocale(
        request('https://x.dev/zh/about', {
          'cookie': 'LOCALE=en',
          'accept-language': 'en-US',
        }),
        CONFIG,
      ),
    ).toBe('zh')
  })

  it('falls back to the cookie', () => {
    expect(
      resolveLocale(
        request('https://x.dev/about', {
          'cookie': 'other=1; LOCALE=zh',
          'accept-language': 'en-US',
        }),
        CONFIG,
      ),
    ).toBe('zh')
  })

  it('then to Accept-Language, respecting q order', () => {
    expect(
      resolveLocale(
        request('https://x.dev/about', {
          'accept-language': 'en;q=0.3,zh-CN;q=0.9',
        }),
        CONFIG,
      ),
    ).toBe('zh')
  })

  it('ignores unknown locales in the cookie', () => {
    expect(
      resolveLocale(
        request('https://x.dev/about', { cookie: 'LOCALE=fr' }),
        CONFIG,
      ),
    ).toBe('en')
  })

  it('keeps excluded paths on the base locale', () => {
    expect(
      resolveLocale(
        request('https://x.dev/api/rpc', { 'accept-language': 'zh-CN' }),
        CONFIG,
      ),
    ).toBe('en')
  })

  it('falls back to the base locale with no hints', () => {
    expect(resolveLocale(request('https://x.dev/about'), CONFIG)).toBe('en')
  })
})
