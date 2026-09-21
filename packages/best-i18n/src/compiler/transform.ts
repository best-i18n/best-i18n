import { MagicString } from 'magic-string'
import { analyze } from './analyze.ts'
import { createEmitter } from './emit.ts'
import { macroSpecifiers } from './message.ts'
import { REACT_MODULE } from './modules.ts'
import type { MacroImport } from './analyze.ts'
import type { TransformOptions, TransformResult } from './message.ts'

export { extract } from './analyze.ts'
export { catalogKey, macroSpecifiers } from './message.ts'
export type {
  ExtractOptions,
  Message,
  TransformOptions,
  TransformResult,
} from './message.ts'

/**
 * The macro bindings compile away with their call sites, so their imports
 * go too. Left in place they would keep the throwing runtime stubs in every
 * bundle: without a `sideEffects` hint a bundler must assume the import
 * matters. Misuse that would leave a live reference - `const p = plural` -
 * is already a build error, so a surviving reference is impossible here.
 */
function stripMacroImports(
  source: MagicString,
  code: string,
  macroImports: MacroImport[],
): void {
  for (const declaration of macroImports) {
    const kept = declaration.entries.filter((entry) => !entry.macro)

    if (kept.length === 0) {
      const end =
        code[declaration.end] === '\n' ? declaration.end + 1 : declaration.end
      source.remove(declaration.start, end)
      continue
    }

    // A macro module can be a user re-export that also carries real values:
    // keep those, drop only the macro names.
    const named = kept
      .filter((entry) => entry.kind === 'Name')
      .map((entry) => {
        const spec =
          entry.imported === entry.local
            ? entry.local
            : `${entry.imported} as ${entry.local}`
        return entry.type ? `type ${spec}` : spec
      })
    const clauses = [
      ...kept
        .filter((entry) => entry.kind === 'Default')
        .map((entry) => entry.local),
      ...(named.length > 0 ? [`{ ${named.join(', ')} }`] : []),
    ]
    source.overwrite(
      declaration.start,
      declaration.end,
      `import ${clauses.join(', ')} from ${declaration.request}`,
    )
  }
}

/**
 * Replaces every `t` tagged template with the compiled message.
 *
 * - with `staticLocale`: a plain template literal for that locale, so no
 *   runtime, no locale lookup and no other locale survives.
 * - without: a locale ternary that falls through to `baseLocale`.
 */
export function transform(
  code: string,
  filename: string,
  options: TransformOptions,
): TransformResult | null {
  const tag = options.tag ?? 't'

  // Whether to parse at all. Text, not AST, because deciding by AST would mean
  // parsing every file to find out that almost none of them need it.
  //
  // The module specifier is the only signal this can safely use, and it is
  // enough: a macro has to be imported to be used, so a file that names none of
  // these modules cannot contain a message. Looking for `t\`` instead would be
  // both unsound - an aliased `t as translate` does not contain it - and
  // wasteful: in a real dependency tree 12% of files contain `t\`` and none of
  // them import a macro.
  //
  // Naming the module is not by itself proof of use, so a match only buys a
  // parse. That is deliberate: a file that imports a macro is inspected even
  // with no tagged template in it, otherwise misuse like `foo(t)` would slip
  // through to runtime.
  const imports = macroSpecifiers(options)
  if (!imports.some((specifier) => code.includes(specifier))) return null

  const {
    adapter,
    parsed,
    requests,
    messages,
    hookCalls,
    localeAliases,
    reusableLocaleRead,
    macroImports,
  } = analyze(code, filename, {
    tag,
    from: options.from,
    plural: options.plural,
    hook: options.hook,
    hookFrom: options.hookFrom,
    component: options.component,
    componentFrom: options.componentFrom,
    // Read by analyze to recognize `useLocale` calls, so a custom spelling
    // has to travel.
    reactModule: options.reactModule,
    solid: options.solid,
    vue: options.vue,
  })
  // A configuration the file cannot be compiled under is an error here, not
  // in extraction, which has no such configuration.
  adapter.checkTransform?.(requests, options, filename)
  if (messages.length === 0 && hookCalls.length === 0) return null

  const { directiveEnd, directives } = parsed
  const source = new MagicString(code)
  stripMacroImports(source, code, macroImports)

  const emitter = createEmitter({
    code,
    filename,
    options,
    adapter,
    messages,
    reusableLocaleRead,
    runtimeModule: options.runtimeModule ?? adapter.runtimeModule,
    reactModule: options.reactModule ?? REACT_MODULE,
    isClientModule:
      adapter.clientDirectives && directives.includes('use client'),
  })

  // `const t = useI18n()` becomes `const t = useLocale()`: the variable holds the
  // locale, subscribed through React. In a per-locale build there is nothing
  // to subscribe to, so the call collapses to the literal locale.
  for (const call of hookCalls) {
    if (options.staticLocale !== undefined) {
      source.overwrite(
        call.start,
        call.end,
        JSON.stringify(options.staticLocale),
      )
    } else if (call.alias !== undefined) {
      // The component already read the locale above; share that one read
      // rather than subscribing again. No React import is needed for it.
      source.overwrite(call.start, call.end, call.alias)
    } else {
      source.overwrite(call.start, call.end, emitter.reactLocaleRead())
    }
  }

  // The other half of the same dedupe: a `useLocale()` the module wrote
  // itself, standing after a read that already happened. Left alone in a
  // per-locale build, where the hook above is a literal and there is no
  // subscription to save - and where folding someone's own runtime call to a
  // constant would be a bigger claim than this optimization is making.
  if (options.staticLocale === undefined) {
    for (const alias of localeAliases) {
      source.overwrite(alias.start, alias.end, alias.text)
    }
  }

  for (const message of messages) {
    const { replacement, isElement } = emitter.compile(message)
    source.overwrite(
      message.start,
      message.end,
      // Among JSX children the result has to be braced to stay an expression.
      message.braced === true && !isElement ? `{${replacement}}` : replacement,
    )
  }

  let injected = false
  const inject = (statement: string) => {
    injected = true
    if (directiveEnd === 0) {
      source.prepend(`${statement};\n`)
    } else {
      source.appendLeft(directiveEnd, `\n${statement};`)
    }
  }
  for (const statement of emitter.prologue()) inject(statement)

  adapter.finalize?.(source, code, parsed, injected, messages)

  return {
    code: source.toString(),
    map: source.generateMap({ hires: true, source: filename }),
    messages,
    missing: emitter.missing,
    directives,
    clientUnbound: emitter.clientUnbound,
  }
}
