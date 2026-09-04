// @vitest-environment node
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { Link, usePathname } from '../src/integrations/next/navigation.ts'
import { LocaleProvider } from '../src/react/index.ts'

import type { ReactNode } from 'react'
import type { UrlConfig } from '../src/locale-url.ts'

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => createElement('a', props),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/zh/about',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))

const CONFIG = { locales: ['en', 'zh'], baseLocale: 'en' }

/** The provider is the one channel both module graphs share. */
function render(locale: string, config: UrlConfig, children: ReactNode) {
  return renderToStaticMarkup(
    createElement(LocaleProvider, { locale, config }, children),
  )
}

describe('next/navigation', () => {
  it('localizes an href from the provider locale and config', () => {
    const html = render(
      'zh',
      CONFIG,
      createElement(Link, { href: '/about' }, 'about'),
    )

    expect(html).toContain('href="/zh/about"')
  })

  it('leaves the base locale unprefixed', () => {
    const html = render(
      'en',
      CONFIG,
      createElement(Link, { href: '/about' }, 'about'),
    )

    expect(html).toContain('href="/about"')
  })

  it('prefixes the base locale under prefixBase', () => {
    const html = render(
      'en',
      { ...CONFIG, prefixBase: true },
      createElement(Link, { href: '/about' }, 'about'),
    )

    expect(html).toContain('href="/en/about"')
  })

  it('an explicit locale prop wins, for language switchers', () => {
    const html = render(
      'zh',
      CONFIG,
      createElement(Link, { href: '/about', locale: 'en' }, 'English'),
    )

    expect(html).toContain('href="/about"')
  })

  it('carries no config of its own into the rendered markup', () => {
    // The config travels once, with the provider - not as a prop on every
    // link, which would put a copy in each page's payload.
    const html = render(
      'zh',
      CONFIG,
      createElement(Link, { href: '/about' }, 'about'),
    )

    expect(html).not.toContain('baseLocale')
    expect(html).not.toContain('locales')
  })

  it('usePathname strips the locale prefix', () => {
    let seen: string | undefined
    function Probe() {
      seen = usePathname()
      return null
    }
    render('zh', CONFIG, createElement(Probe))

    expect(seen).toBe('/about')
  })
})
