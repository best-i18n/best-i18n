import { matchJsxTrans, parseJsx } from '../../compiler/jsx.ts'
import { SOLID_MACRO_MODULE, SOLID_MODULE } from '../../compiler/modules.ts'
import type { FrameworkAdapter } from '../../compiler/adapter.ts'

/**
 * Solid: JSX modules whose component bodies run once. The locale is read
 * through `best-i18n/solid`, which Solid tracks, and a `<Trans>` that is not
 * already a JSX child is made one so that read happens inside an effect.
 */
export const solid: FrameworkAdapter = {
  name: 'solid',
  runtimeModule: SOLID_MODULE,
  componentModule: SOLID_MACRO_MODULE,
  clientDirectives: false,
  transFragment: true,
  parse: parseJsx,
  matchTrans: matchJsxTrans,
  hoistable: () => true,

  // Solid has no hook: a component body runs once, so there is nothing for
  // `useI18n()` to re-run. Rejected here so the extractor sees it too.
  checkImports(imports, { tag, hook, hookFrom }) {
    const importsHook = imports.some(
      (declaration) =>
        hookFrom.includes(declaration.moduleRequest.value) &&
        declaration.entries.some(
          (entry) =>
            !entry.isType &&
            entry.importName.kind === 'Name' &&
            entry.importName.name === hook,
        ),
    )
    if (importsHook) {
      throw new Error(
        `best-i18n: Solid uses ${tag} and reactive accessors; React ${hook} is not supported.`,
      )
    }
  },

  // Compiled without `solid: true`, a Solid <Trans> would read the locale
  // through best-i18n/runtime, which Solid does not track: setLocale() would
  // leave the text as it was, and nothing would say why. Refuse instead.
  checkTransform(requests, options, filename) {
    if (requests.includes(SOLID_MACRO_MODULE) && options.solid !== true) {
      throw new Error(
        `best-i18n: ${filename} imports ${SOLID_MACRO_MODULE}, but the plugin ` +
          'was not told this is a Solid project. Set solid: true in the ' +
          'best-i18n plugin options.',
      )
    }
  },

  // A <Trans> that is returned or stored rather than nested in JSX has to
  // become a JSX child expression, so its locale read runs inside a reactive
  // scope. A per-locale build has no locale read, and its fragment is
  // already JSX; an attribute value is read inside an effect already.
  wrapReplacement(message, replacement, { staticLocale }) {
    if (
      !staticLocale &&
      message.elements !== undefined &&
      !message.braced &&
      message.attribute !== true
    ) {
      return `<>{${replacement}}</>`
    }
    return replacement
  },
}
