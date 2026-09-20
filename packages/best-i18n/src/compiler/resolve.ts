import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

function isMissing(specifier: string, cause: unknown): cause is Error {
  return (
    cause instanceof Error &&
    (cause as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND' &&
    cause.message.startsWith(`Cannot find module '${specifier}'`)
  )
}

/**
 * Loads a framework's own compiler - `svelte/compiler`, `vue/compiler-sfc` -
 * the way the component will later be compiled: from the component's own
 * project first, then the working directory, and only then from wherever
 * this library sits. Resolving from here alone would miss a framework
 * installed only in a sub-package of a monorepo that hoisted best-i18n to its
 * root, or pick a different version than the one the app builds with.
 *
 * `hint` is the install instruction shown when nothing resolves.
 */
export function requireFromProject<T>(
  specifier: string,
  filename: string,
  hint: string,
): T {
  const bases = [
    ...new Set([
      path.resolve(filename),
      path.join(process.cwd(), '__best-i18n__.js'),
    ]),
    import.meta.url,
  ]
  let missing: Error | undefined
  for (const base of bases) {
    let resolved: string
    try {
      resolved = createRequire(base).resolve(specifier)
    } catch (cause) {
      // Any other failure - a broken package, an exports map that refuses
      // the subpath - is the real diagnosis; do not paper over it.
      if (!isMissing(specifier, cause)) throw cause
      missing = cause
      continue
    }
    // Load outside the catch: failures inside an installed compiler must
    // retain their original diagnostics, including missing transitive
    // dependencies.
    return createRequire(import.meta.url)(resolved) as T
  }
  throw new Error(`best-i18n: ${hint}`, { cause: missing })
}
