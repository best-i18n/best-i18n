import { matchJsxTrans, parseJsx } from '../../compiler/jsx.ts'
import { REACT_MACRO_MODULE, RUNTIME_MODULE } from '../../compiler/modules.ts'
import type { FrameworkAdapter } from '../../compiler/adapter.ts'

/**
 * React, and the default: JSX modules, `useI18n()` for components that must
 * re-render on a locale change, and `'use client'` marking the modules that
 * render from two module graphs on the App Router.
 */
export const react: FrameworkAdapter = {
  name: 'react',
  runtimeModule: RUNTIME_MODULE,
  componentModule: REACT_MACRO_MODULE,
  clientDirectives: true,
  transFragment: true,
  parse: parseJsx,
  matchTrans: matchJsxTrans,
  hoistable: () => true,
}
