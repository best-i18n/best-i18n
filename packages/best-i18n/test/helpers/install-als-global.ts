import { AsyncLocalStorage } from 'node:async_hooks'

// Next's server storages are fakes that throw on use unless the server
// bootstrap has installed this global. Tests play the bootstrap's part.
// Must run before any `next/dist/server/*` module evaluates.
const globals = globalThis as Record<string, unknown>
globals.AsyncLocalStorage ??= AsyncLocalStorage
