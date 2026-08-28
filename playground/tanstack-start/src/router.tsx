import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { resolveClientLocale } from 'best-i18n/client'
import { deLocalizeUrl, localizeUrl } from 'best-i18n/locale-url'
import { getLocale, setLocale } from 'best-i18n/runtime'

import { i18n } from './i18n'
import { routeTree } from './routeTree.gen'

// Before hydration, so the first client render agrees with the server's. The
// order `resolveClientLocale` uses is the same one the server used, which is
// what makes the two agree on an unprefixed URL.
if (typeof window !== 'undefined') {
  setLocale(
    resolveClientLocale({
      pathname: window.location.pathname,
      cookie: document.cookie,
      languages: navigator.languages,
      config: i18n,
    }),
  )
}

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    // The route tree is authored without a locale segment. The prefix is
    // stripped on the way in and put back on the way out, so `<Link to="/about">`
    // renders `/zh/about` while Chinese is active.
    rewrite: {
      input: ({ url }) => deLocalizeUrl(url, i18n),
      output: ({ url }) => localizeUrl(url, getLocale(), i18n),
    },
  })
}
