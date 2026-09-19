import { i18n } from '$lib/i18n'
import { getLocale } from 'best-i18n/runtime'
import { withRequestLocale } from 'best-i18n/server'
import type { Handle } from '@sveltejs/kit'

/**
 * Binds the locale for the whole request, then stamps `lang` on the document.
 *
 * SvelteKit hands over the request in `handle`, so the render can sit inside
 * AsyncLocalStorage the same way the TanStack Start playground does.
 */
export const handle: Handle = ({ event, resolve }) =>
  withRequestLocale(event.request, i18n, () => {
    const locale = getLocale()
    return resolve(event, {
      transformPageChunk: ({ html }) => html.replaceAll('%lang%', locale),
    })
  })
