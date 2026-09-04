// @vitest-environment node
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { createNavigation } from '../src/integrations/next/navigation.ts'
import { LocaleProvider } from '../src/react/index.ts'

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => createElement('a', props),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/zh/about',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))

const CONFIG = { locales: ['en', 'zh'], baseLocale: 'en' }

describe('createNavigation', () => {
  it('localizes hrefs from the provider locale, config bound at creation', () => {
    const { Link } = createNavigation(CONFIG)

    const html = renderToStaticMarkup(
      createElement(
        LocaleProvider,
        { locale: 'zh', config: CONFIG },
        createElement(Link, { href: '/about' }, 'about'),
      ),
    )

    expect(html).toContain('href="/zh/about"')
  })

  it('needs no provider: the base locale renders unprefixed', () => {
    const { Link } = createNavigation(CONFIG)

    const html = renderToStaticMarkup(
      createElement(Link, { href: '/about' }, 'about'),
    )

    expect(html).toContain('href="/about"')
  })

  it('prefixes the base locale under prefixBase', () => {
    const { Link } = createNavigation({ ...CONFIG, prefixBase: true })

    const html = renderToStaticMarkup(
      createElement(Link, { href: '/about' }, 'about'),
    )

    expect(html).toContain('href="/en/about"')
  })

  it('an explicit locale prop wins, for language switchers', () => {
    const { Link } = createNavigation(CONFIG)

    const html = renderToStaticMarkup(
      createElement(
        LocaleProvider,
        { locale: 'zh', config: CONFIG },
        createElement(Link, { href: '/about', locale: 'en' }, 'English'),
      ),
    )

    expect(html).toContain('href="/about"')
  })

  it('usePathname strips the locale prefix', () => {
    const { usePathname } = createNavigation(CONFIG)

    let seen: string | undefined
    function Probe() {
      seen = usePathname()
      return null
    }
    renderToStaticMarkup(createElement(Probe))

    expect(seen).toBe('/about')
  })
})
