import { createRouter as createTanStackRouter } from '@tanstack/react-router'

import { deLocalizeUrl, localizeUrl } from './paraglide/runtime'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    // The same shape as the best-i18n playground, and the same two function
    // names - this part of the two designs converged independently.
    rewrite: {
      input: ({ url }) => deLocalizeUrl(url),
      output: ({ url }) => localizeUrl(url),
    },
  })
}
