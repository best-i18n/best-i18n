import { createSignal } from 'solid-js'
import { isServer } from 'solid-js/web'
import { getLocale as readLocale, subscribeLocale } from './runtime/index.ts'

// One client-side signal bridges the shared locale store into Solid's graph.
// Keep the actual locale in the runtime: SSR must read it per request, and
// configure() may change the fallback before the first client render.
//
// `isServer` here comes from solid-js/web's export condition, while the
// runtime decides by `typeof window`. They agree in a browser and in Node;
// under a DOM shim on the server they may not, and the only consequence is
// that the read goes untracked - the locale itself is still right.
const [revision, invalidate] = createSignal(0)
if (!isServer) subscribeLocale(() => invalidate((value) => value + 1))

/** Tracks locale changes in JSX, accessors and createMemo computations. */
export function getLocale(): string {
  if (!isServer) revision()
  return readLocale()
}

export { configure, getLocales, setLocale } from './runtime/index.ts'
