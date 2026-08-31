import { describe, expect, it } from 'vitest'

import { resolveClientLocale } from '../src/client.ts'
import { resolveLocale } from '../src/request.ts'

const CONFIG = {
  locales: ['en', 'zh'],
  baseLocale: 'en',
  exclude: /^\/api(\/|$)/,
}

function client(options: {
  pathname: string
  cookie?: string
  languages?: string[]
}) {
  return resolveClientLocale({
    pathname: options.pathname,
    cookie: options.cookie ?? '',
    languages: options.languages ?? [],
    config: CONFIG,
  })
}

describe('resolveClientLocale', () => {
  it('prefers the URL prefix', () => {
    expect(
      client({
        pathname: '/zh/about',
        cookie: 'LOCALE=en',
        languages: ['en-US'],
      }),
    ).toBe('zh')
  })

  it('falls back to the cookie', () => {
    expect(
      client({
        pathname: '/about',
        cookie: 'x=1; LOCALE=zh',
        languages: ['en-US'],
      }),
    ).toBe('zh')
  })

  it('then to the browser language, matching by prefix', () => {
    expect(client({ pathname: '/about', languages: ['zh-CN', 'en'] })).toBe(
      'zh',
    )
  })

  it('ignores unknown cookie locales', () => {
    expect(client({ pathname: '/about', cookie: 'LOCALE=fr' })).toBe('en')
  })

  it('falls through a malformed cookie instead of throwing', () => {
    // This runs at module scope in router bootstraps - a URIError here is a
    // blank page for as long as the cookie persists.
    expect(client({ pathname: '/about', cookie: 'LOCALE=%' })).toBe('en')
    expect(
      client({
        pathname: '/about',
        cookie: 'LOCALE=%E0%A4%A',
        languages: ['zh'],
      }),
    ).toBe('zh')
  })

  it('falls back to the base locale', () => {
    expect(client({ pathname: '/about' })).toBe('en')
  })
})

describe('client resolution mirrors the server', () => {
  // The invariant that prevents hydration mismatches: for any request the
  // server could see, the client-side resolution of the same facts must land
  // on the same locale.
  const SCENARIOS = [
    { pathname: '/zh/about', cookie: '', languages: [] },
    { pathname: '/zh/about', cookie: 'LOCALE=en', languages: ['en-US'] },
    { pathname: '/about', cookie: 'LOCALE=zh', languages: ['en-US'] },
    { pathname: '/about', cookie: '', languages: ['zh-CN', 'en;q=0.5'] },
    { pathname: '/about', cookie: 'LOCALE=fr', languages: [] },
    { pathname: '/', cookie: '', languages: [] },
    { pathname: '/api/rpc', cookie: 'LOCALE=zh', languages: ['zh-CN'] },
  ]

  for (const scenario of SCENARIOS) {
    it(`${scenario.pathname} cookie=${scenario.cookie || '-'} lang=${scenario.languages.join(',') || '-'}`, () => {
      const headers: Record<string, string> = {}
      if (scenario.cookie !== '') headers.cookie = scenario.cookie
      if (scenario.languages.length > 0) {
        headers['accept-language'] = scenario.languages.join(',')
      }

      const server = resolveLocale(
        new Request(`https://x.dev${scenario.pathname}`, { headers }),
        CONFIG,
      )
      const browser = client({
        ...scenario,
        // navigator.languages carries bare tags, not q-weighted ones.
        languages: scenario.languages.map((tag) => tag.split(';')[0]!),
      })

      expect(browser).toBe(server)
    })
  }
})
