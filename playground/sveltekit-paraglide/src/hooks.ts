import { deLocalizeUrl } from '$lib/paraglide/runtime'
import type { Reroute } from '@sveltejs/kit'

/** `/zh/about` renders `src/routes/about`; the address bar is unchanged. */
export const reroute: Reroute = ({ url }) => deLocalizeUrl(url).pathname
