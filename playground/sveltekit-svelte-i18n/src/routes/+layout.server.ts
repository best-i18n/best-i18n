import type { LayoutServerLoad } from './$types'

/** Hands the server's decision to the client, so hydration matches SSR. */
export const load: LayoutServerLoad = ({ locals }) => ({
  locale: locals.locale,
})
