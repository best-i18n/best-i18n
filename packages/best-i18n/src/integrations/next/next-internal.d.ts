/**
 * Next.js keeps the current render in an AsyncLocalStorage it does not export
 * from its public entry points. The `.external.js` suffix is Next's own marker
 * for "never bundle this, require it at runtime", which is what guarantees
 * every module in the render sees the same instance - the reason it can be
 * read from here at all.
 *
 * `rootParams` landed in Next 15.2, on all four store types - a request and
 * each of the three prerender flavours - which is why the locale is readable
 * while building a static page as well as while serving one. That version is
 * the peer floor: on 15.0 and 15.1 this falls through to the proxy header,
 * which a prerender does not have, so a statically generated page would come
 * out in the base locale without saying so.
 */
declare module 'next/dist/server/app-render/work-unit-async-storage.external.js' {
  interface WorkUnitStore {
    type?: string
    rootParams?: Record<string, string | undefined>
    headers?: { get: (name: string) => string | null }
  }

  export const workUnitAsyncStorage: {
    getStore: () => WorkUnitStore | undefined
  }
}
