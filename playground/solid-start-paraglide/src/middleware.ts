import { createMiddleware } from '@solidjs/start/middleware'
import { paraglideMiddleware } from './paraglide/server'

/** Paraglide's own middleware binds the locale for the render. */
export default createMiddleware([
  (event, next) =>
    paraglideMiddleware(event.req, () => next() as Promise<Response>),
])
