import { react } from '../frameworks/react/compiler.ts'
import { solid } from '../frameworks/solid/compiler.ts'
import { svelte, SVELTE_FILE } from '../frameworks/svelte/compiler.ts'
import { vue } from '../frameworks/vue/compiler.ts'
import {
  MACRO_MODULE,
  REACT_MACRO_MODULE,
  SOLID_MACRO_MODULE,
  SOLID_MODULE,
  VUE_MACRO_MODULE,
  VUE_MODULE,
} from './modules.ts'
import type { FrameworkAdapter } from './adapter.ts'

/** Every framework the compiler knows, in the order their macros are listed. */
export const adapters: readonly FrameworkAdapter[] = [react, svelte, solid, vue]

export const DEFAULT_FROM = [MACRO_MODULE]
export const DEFAULT_HOOK_FROM = [REACT_MACRO_MODULE]
export const DEFAULT_COMPONENT_FROM = adapters.map(
  (adapter) => adapter.componentModule,
)

/**
 * The adapter a file is parsed with. Svelte announces itself by extension;
 * Vue by extension or by the plugin option, since its composables are plain
 * TypeScript; Solid and React are both JSX, so the plugin option decides,
 * React being the default that predates the others.
 */
export function selectAdapter(
  filename: string,
  options: { solid?: boolean; vue?: boolean },
): FrameworkAdapter {
  const cleanName = filename.split('?')[0] ?? filename
  if (SVELTE_FILE.test(cleanName)) return svelte
  if (cleanName.endsWith('.vue') || options.vue === true) return vue
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
  if (adapter !== react) return adapter
  if (
    requests.some(
      (request) => request === SOLID_MODULE || request === SOLID_MACRO_MODULE,
    )
  ) {
    return solid
  }
  if (
    requests.some(
      (request) => request === VUE_MODULE || request === VUE_MACRO_MODULE,
    )
  ) {
    return vue
  }
  return adapter
}
