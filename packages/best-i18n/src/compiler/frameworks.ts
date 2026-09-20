import { react } from '../frameworks/react/compiler.ts'
import { solid } from '../frameworks/solid/compiler.ts'
import { svelte, SVELTE_FILE } from '../frameworks/svelte/compiler.ts'
import {
  MACRO_MODULE,
  REACT_MACRO_MODULE,
  SOLID_MACRO_MODULE,
  SOLID_MODULE,
} from './modules.ts'
import type { FrameworkAdapter } from './adapter.ts'

/** Every framework the compiler knows, in the order their macros are listed. */
export const adapters: readonly FrameworkAdapter[] = [react, svelte, solid]

export const DEFAULT_FROM = [MACRO_MODULE]
export const DEFAULT_HOOK_FROM = [REACT_MACRO_MODULE]
export const DEFAULT_COMPONENT_FROM = adapters.map(
  (adapter) => adapter.componentModule,
)

/**
 * The adapter a file is parsed with. Svelte announces itself by extension;
 * Solid and React are both JSX, so the plugin option decides, React being the
 * default that predates the others.
 */
export function selectAdapter(
  filename: string,
  options: { solid?: boolean },
): FrameworkAdapter {
  if (SVELTE_FILE.test(filename.split('?')[0] ?? filename)) return svelte
  return options.solid === true ? solid : react
}

/**
 * A second look once the imports are known. A file that imports a Solid
 * entry point has said what it is, whether or not the plugin was told - and
 * Solid's own checks then get to say whether the configuration is complete.
 */
export function refineAdapter(
  adapter: FrameworkAdapter,
  requests: readonly string[],
): FrameworkAdapter {
  if (
    adapter === react &&
    requests.some(
      (request) => request === SOLID_MODULE || request === SOLID_MACRO_MODULE,
    )
  ) {
    return solid
  }
  return adapter
}
