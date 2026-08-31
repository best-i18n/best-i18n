import { describe, expect, it } from 'vitest'

import { resolveLocale } from '../src/request.ts'
import { configure, getLocale } from '../src/runtime/index.ts'
import { withLocale } from '../src/runtime/server.ts'

const CONFIG = { locales: ['en', 'zh', 'de'], baseLocale: 'en' }

const request = (headers: Record<string, string>, url = 'https://x.test/') =>
  new Request(url, { headers })

describe('resolveLocale', () => {
  it('falls through a malformed cookie instead of throwing', () => {
    // Cookies are attacker-supplied: `%` must not 500 every request.
    expect(resolveLocale(request({ cookie: 'LOCALE=%' }), CONFIG)).toBe('en')
    expect(
      resolveLocale(
        request({ 'cookie': 'LOCALE=%E0%A4%A', 'accept-language': 'zh' }),
        CONFIG,
      ),
    ).toBe('zh')
  })

  it('ignores q=0 languages, which mean "not acceptable"', () => {
    expect(
      resolveLocale(request({ 'accept-language': 'zh;q=0, de' }), CONFIG),
    ).toBe('de')
    expect(
      resolveLocale(request({ 'accept-language': 'zh;q=0' }), CONFIG),
    ).toBe('en')
  })
})

describe('runtime configuration', () => {
  it('withLocale binds and getLocale reads it', () => {
    expect(withLocale('zh', () => getLocale())).toBe('zh')
  })

  it('configure sets the fallback base locale', () => {
    // Without configure, getLocale() outside any request falls back to a
    // hardcoded 'en' - wrong for any app whose base locale is not English.
    configure({ baseLocale: 'de', locales: ['de', 'en'] })
    try {
      expect(getLocale()).toBe('de')
    } finally {
      configure({ baseLocale: 'en', locales: ['en'] })
    }
  })
})
