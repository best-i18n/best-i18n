import { deLocalizePathname } from '$lib/i18n/url.ts'
import type { Reroute } from '@sveltejs/kit'

/** `/zh/about` renders `src/routes/about`; the address bar is unchanged. */
export const reroute: Reroute = ({ url }) => {
  const rest = deLocalizePathname(url.pathname)
  return rest === url.pathname ? undefined : rest
}
