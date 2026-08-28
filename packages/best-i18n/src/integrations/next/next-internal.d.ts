/**
 * Next.js keeps the current render in an AsyncLocalStorage it does not export
 * from its public entry points. The `.external.js` suffix is Next's own marker
 * for "never bundle this, require it at runtime", which is what guarantees
 * every module in the render sees the same instance - the reason it can be
 * read from here at all.
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
