import { resolveLocale } from '$lib/i18n/url.ts'
import { locale, waitLocale } from 'svelte-i18n'
import '$lib/i18n'
import type { Handle } from '@sveltejs/kit'

/**
 * svelte-i18n keeps the locale in one module-level store, so on the server
 * this is a global write per request - the pattern its SvelteKit guide shows,
 * and one that two concurrent requests in different languages can race on.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const lang = resolveLocale(event.request)
  event.locals.locale = lang
  locale.set(lang)
  await waitLocale(lang)
  return resolve(event, {
    transformPageChunk: ({ html }) => html.replaceAll('%lang%', lang),
  })
}
