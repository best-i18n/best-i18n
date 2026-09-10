import { describe, expect, it } from 'vitest'

import { resolveClientLocale } from '../src/client.ts'
import { matchLocale, rankAcceptLanguage } from '../src/locale-tag.ts'
import { resolveLocale } from '../src/request.ts'

/**
 * Language negotiation, against cases borrowed from the libraries that have
 * already been through this: next-intl's `resolveLocale` tests for tag
 * matching, and `negotiator`'s reading of the `q` parameter.
 *
 * Both halves of the resolution go through the same matcher, so every case
 * here is run twice - once as an `Accept-Language` header, once as
 * `navigator.languages` - which is what keeps an unprefixed path from
 * hydrating in a different language than it rendered in.
 */

const server = (
  header: string,
  locales: string[],
  baseLocale: string,
): string =>
  resolveLocale(
    new Request('https://x.test/about', {
      headers: { 'accept-language': header },
    }),
    { locales, baseLocale },
  )

const client = (
  header: string,
  locales: string[],
  baseLocale: string,
): string =>
  resolveClientLocale({
    pathname: '/about',
    cookie: '',
    // navigator.languages carries bare tags in preference order, which is
    // the header once the q values have been resolved.
    languages: rankAcceptLanguage(header),
    config: { locales, baseLocale },
  })

describe('tag matching', () => {
  const CASES: {
    name: string
    header: string
    locales: string[]
    baseLocale: string
    expected: string
  }[] = [
    {
      name: 'resolves a more specific tag to a generic locale',
      header: 'en-US;q=0.9,de;q=0.7',
      locales: ['en', 'de'],
      baseLocale: 'de',
      expected: 'en',
    },
    {
      name: 'resolves a different region to a locale that shares the language',
      header: 'en-GB;q=0.9',
      locales: ['en-US', 'de-DE'],
      baseLocale: 'de-DE',
      expected: 'en-US',
    },
    {
      name: 'answers a tag fully before moving on to the next one',
      header: 'en-GB,de',
      locales: ['de', 'en-US'],
      baseLocale: 'de',
      expected: 'en-US',
    },
    {
      name: 'returns the locale in the spelling the config uses',
      header: 'de-at;q=0.9,en-gb;q=0.8',
      locales: ['en', 'en-gb', 'de-at', 'pt'],
      baseLocale: 'en',
      expected: 'de-at',
    },
    {
      name: 'prefers the most specific locale, however the config orders it',
      header: 'de-DE,de;q=0.9,en-US;q=0.8',
      locales: ['en', 'de', 'de-DE'],
      baseLocale: 'de',
      expected: 'de-DE',
    },
    {
      name: 'truncates one subtag at a time, not straight to the language',
      header: 'zh-Hant-TW',
      locales: ['zh-Hans', 'zh-Hant'],
      baseLocale: 'zh-Hans',
      expected: 'zh-Hant',
    },
    {
      name: 'looks past a private-use subtag in a configured locale',
      header: 'en;q=0.9,de;q=0.7',
      locales: ['de-x-p2', 'en-x-p1'],
      baseLocale: 'de-x-p2',
      expected: 'en-x-p1',
    },
    {
      name: 'matches case-insensitively',
      header: 'ZH-cn',
      locales: ['en', 'zh'],
      baseLocale: 'en',
      expected: 'zh',
    },
    {
      name: 'falls back to the base locale when nothing is on offer',
      header: 'fr-CA,fr',
      locales: ['en', 'zh'],
      baseLocale: 'en',
      expected: 'en',
    },
  ]

  for (const test of CASES) {
    it(`${test.name} (server)`, () => {
      expect(server(test.header, test.locales, test.baseLocale)).toBe(
        test.expected,
      )
    })

    it(`${test.name} (client)`, () => {
      expect(client(test.header, test.locales, test.baseLocale)).toBe(
        test.expected,
      )
    })
  }
})

describe('quality values', () => {
  const CONFIG = { locales: ['en', 'zh', 'de'], baseLocale: 'en' }
  const negotiate = (header: string) =>
    resolveLocale(
      new Request('https://x.test/', {
        headers: { 'accept-language': header },
      }),
      CONFIG,
    )

  it('orders by q, not by position', () => {
    expect(negotiate('zh;q=0.2, de;q=0.8')).toBe('de')
  })

  it('keeps the sent order among tags of equal q', () => {
    expect(negotiate('zh;q=0.8, de;q=0.8')).toBe('zh')
    expect(negotiate('de;q=0.8, zh;q=0.8')).toBe('de')
  })

  it('treats a tag with no q as q=1', () => {
    expect(negotiate('zh, de;q=0.9')).toBe('zh')
  })

  it('drops q=0, which means "not acceptable"', () => {
    expect(negotiate('zh;q=0, de')).toBe('de')
    expect(negotiate('zh;q=0')).toBe('en')
  })

  it('drops an unparseable q rather than ranking it', () => {
    expect(negotiate('zh;q=please, de')).toBe('de')
  })

  it('ignores a wildcard instead of letting it match anything', () => {
    // `*` names no language, so there is nothing to prefer over the base
    // locale - but a real tag alongside it still has to win.
    expect(negotiate('*')).toBe('en')
    expect(negotiate('de;q=0.1, *;q=0.9')).toBe('de')
  })

  it('survives a header made of nothing but separators', () => {
    expect(negotiate(',,;q=0.5,')).toBe('en')
    expect(negotiate('')).toBe('en')
  })

  it('tolerates whitespace around the parameter', () => {
    expect(negotiate(' de ; q=0.9 , zh ; q=0.1 ')).toBe('de')
  })
})

describe('matchLocale', () => {
  it('reports no match rather than guessing', () => {
    expect(matchLocale(['fr', 'es'], ['en', 'zh'])).toBeUndefined()
  })

  it('skips empty tags', () => {
    expect(matchLocale(['', ' ', 'zh'], ['en', 'zh'])).toBe('zh')
  })

  it('takes the first configured locale sharing the language', () => {
    // Config order is the author's preference; nothing in a browser tag says
    // which regional variant to prefer.
    expect(matchLocale(['en-AU'], ['en-US', 'en-GB'])).toBe('en-US')
    expect(matchLocale(['en-AU'], ['en-GB', 'en-US'])).toBe('en-GB')
  })

  it('prefers an exact match over a shared language', () => {
    expect(matchLocale(['en-GB'], ['en-US', 'en-GB'])).toBe('en-GB')
  })
})
