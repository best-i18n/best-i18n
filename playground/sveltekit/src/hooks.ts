import { i18n } from '$lib/i18n'
import { normalizeUrl } from '@sveltejs/kit'
import { deLocalizePathname } from 'best-i18n/locale-url'
import type { Reroute } from '@sveltejs/kit'

/**
 * The route tree is authored without a locale segment. Strip `/zh` on the way
 * in so `/zh/about` renders `src/routes/about`. The address bar is unchanged.
 * Universal: SvelteKit only reads `reroute` from `hooks.ts`, not server hooks.
 *
 * `normalizeUrl` peels off `/__data.json` so a client navigation's data
 * request is rewritten too, not just the document URL.
 */
export const reroute: Reroute = ({ url }) => {
  const { url: page, denormalize } = normalizeUrl(url)
  const rest = deLocalizePathname(page.pathname, i18n)
  if (rest === page.pathname) return
  return denormalize(rest).pathname
}
