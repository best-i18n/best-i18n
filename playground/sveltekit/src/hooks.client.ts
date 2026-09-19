import { i18n } from '$lib/i18n'
import { resolveClientLocale } from 'best-i18n/client'
import { setLocale } from 'best-i18n/svelte'
import type { ClientInit } from '@sveltejs/kit'

/**
 * Before hydration, so the first client render agrees with the server's.
 * The order `resolveClientLocale` uses is the same one the server used.
 */
export const init: ClientInit = () => {
  setLocale(
    resolveClientLocale({
      pathname: window.location.pathname,
      cookie: document.cookie,
      languages: navigator.languages,
      config: i18n,
    }),
  )
}
