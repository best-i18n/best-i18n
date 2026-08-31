import { createMiddleware, createStart } from '@tanstack/react-start'

import { paraglideMiddleware } from './paraglide/server'

/** Paraglide's own request middleware binds the locale for the render. */
const localeMiddleware = createMiddleware().server(({ next, request }) =>
  paraglideMiddleware(request, () => next() as never),
)

export const startInstance = createStart(() => ({
  requestMiddleware: [localeMiddleware],
}))
