import MagicString from 'magic-string'
import { parseSync } from 'oxc-parser'

import { isNonReferencePosition, resolveMacroBindings } from './bindings.ts'
import {
  renderTemplate,
  renderTrans,
  serializeTrans,
  validateTemplateTranslation,
} from './trans.ts'

import type { StaticImport } from './bindings.ts'
import type { TransElement } from './trans.ts'

export interface Message {
  /** Source text with positional placeholders, e.g. `Hi {0}, you have {1}`. */
  text: string
  /** Source of each interpolated expression, in order. */
  expressions: string[]
  start: number
  end: number
  /** 1-based line of the macro call, for PO `#:` references. */
  line: number
  /**
   * Set when the tag came from `const t = useI18n()`: the emitted ternary reads
   * this variable (which holds the locale at runtime) instead of calling
   * `getLocale()`, so the component re-renders on locale change.
   */
  localeVar?: string
  /**
   * Set for `<Trans>`: the elements its placeholders stand for, kept as source
   * so the markup can be rebuilt around whatever order a translation puts it in.
   */
  elements?: TransElement[]
  /**
   * Set for a `<Trans>` that sits among JSX children, where the replacement has
   * to be wrapped in braces to stay an expression rather than become text.
   */
  braced?: boolean
}

interface HookCall {
  /** Range of the `useI18n()` call expression, to be rewritten. */
  start: number
  end: number
  /** Variable it was assigned to, which becomes the locale in that scope. */
  name: string
}

/** A function body, so a `<Trans>` can be matched to the scope it sits in. */
interface Scope {
  start: number
  end: number
  localeVar?: string
}

const FUNCTIONS = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
])

export interface TransformOptions {
  /** Every locale. `baseLocale` is the fallback for missing translations. */
  locales: string[]
  baseLocale: string
  /**
   * `source text -> locale -> translation`.
   *
   * Keyed by the source text, not by an id: the transform therefore never
   * computes an id, so it cannot disagree with the extractor about how ids are
   * derived. Ids live only in the PO files.
   */
  catalog: Record<string, Record<string, string> | undefined>
  /**
   * Emit only this locale and drop the runtime lookup entirely (per-locale
   * build). Leave undefined to emit a locale ternary instead.
   */
  staticLocale?: string | undefined
  /** Module that exports `getLocale`. Only imported when needed. */
  runtimeModule?: string
  /** Name of the tagged template to treat as a message. */
  tag?: string
  /**
   * Modules whose `tag` export is the macro. Matching is done on the imported
   * binding, not on the identifier's name, so aliases work and an unrelated
   * `t` from another library is left alone. Add your own path here if you
   * re-export the macro.
   *
   * Compared against the literal specifier as written in the source, not the
   * resolved module, so list every form you actually import.
   *
   * @default ['best-i18n/macro']
   */
  from?: string[]
  /** Name of the hook-shaped macro export. */
  hook?: string
  /**
   * Modules whose `hook` export is the hook macro. Same literal-specifier
   * matching as `from`.
   *
   * @default ['best-i18n/react/macro']
   */
  hookFrom?: string[]
  /** Module the injected `useLocale` import points at. */
  reactModule?: string
  /** Name of the component-shaped macro export. */
  component?: string
  /**
   * Modules whose `component` export is the `<Trans>` macro. Same
   * literal-specifier matching as `from`.
   *
   * @default ['best-i18n/react/macro']
   */
  componentFrom?: string[]
}

export interface TransformResult {
  code: string
  map: ReturnType<MagicString['generateMap']>
  messages: Message[]
  /** Messages with no translation for a locale, reported rather than hidden. */
  missing: Array<{ text: string; locale: string }>
  /**
   * The module's directive prologue. An integration may need it: on Next.js a
   * client module resolves its locale through React, a server one through the
   * request, and only the directive says which this is.
   */
  directives: string[]
}

const DEFAULT_FROM = ['best-i18n/macro']
const DEFAULT_HOOK_FROM = ['best-i18n/react/macro']
const DEFAULT_COMPONENT_FROM = ['best-i18n/react/macro']

type Lang = 'ts' | 'tsx' | 'js' | 'jsx'

const LANGS = new Map<string, Lang>([
  ['ts', 'ts'],
  ['tsx', 'tsx'],
  ['js', 'js'],
  ['jsx', 'jsx'],
  ['mts', 'ts'],
  ['mjs', 'js'],
])

function walk(
  node: unknown,
  visit: (
    node: Record<string, unknown>,
    parent?: Record<string, unknown>,
  ) => void,
  parent?: Record<string, unknown>,
) {
  if (node === null || typeof node !== 'object') return

  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent)
    return
  }

  const record = node as Record<string, unknown>
  const isNode = typeof record.type === 'string'
  if (isNode) visit(record, parent)

  for (const key of Object.keys(record)) {
    if (key !== 'type') walk(record[key], visit, isNode ? record : parent)
  }
}

/** 1-based line number of a byte offset. */
function lineAt(code: string, offset: number): number {
  let line = 1
  for (let index = 0; index < offset && index < code.length; index++) {
    if (code[index] === '\n') line++
  }
  return line
}

export interface ExtractOptions {
  tag?: string
  from?: string[]
  hook?: string
  hookFrom?: string[]
  component?: string
  componentFrom?: string[]
}

/** Collects the messages in `code` without modifying it. */
export function extract(
  code: string,
  filename: string,
  options: ExtractOptions = {},
): Message[] {
  return analyze(code, filename, options).messages
}

/**
 * End offset of the leading directive prologue (`'use client'`, `'use server'`).
 *
 * Injected imports have to go after it: a directive that is no longer the first
 * statement in the file is just a string expression, so prepending would
 * silently turn a client component into a server one.
 */
function directivePrologue(program: unknown): {
  end: number
  directives: string[]
} {
  const body =
    (program as { body?: Array<Record<string, unknown>> } | undefined)?.body ??
    []
  let end = 0
  const directives: string[] = []

  for (const statement of body) {
    if (statement.type !== 'ExpressionStatement') break
    const expression = statement.expression as
      { type?: string; value?: unknown } | undefined
    if (
      expression?.type !== 'Literal' ||
      typeof expression.value !== 'string'
    ) {
      break
    }
    end = statement.end as number
    directives.push(expression.value)
  }

  return { end, directives }
}

/** Shared by extract() and transform(): messages plus useI18n() call sites. */
function analyze(
  code: string,
  filename: string,
  options: ExtractOptions = {},
): {
  messages: Message[]
  hookCalls: HookCall[]
  directiveEnd: number
  directives: string[]
} {
  const tag = options.tag ?? 't'
  const from = options.from ?? DEFAULT_FROM
  const hook = options.hook ?? 'useI18n'
  const hookFrom = options.hookFrom ?? DEFAULT_HOOK_FROM
  const component = options.component ?? 'Trans'
  const componentFrom = options.componentFrom ?? DEFAULT_COMPONENT_FROM

  // Module ids carry query strings (TanStack Router appends `?tsr-split=...`,
  // vite appends `?url` etc.), so strip them before looking at the extension.
  // Guessing `ts` for a `.tsx` file makes the parser read JSX as a type
  // assertion and fail.
  const cleanName = filename.split('?')[0] ?? filename
  const extension = cleanName.split('.').pop() ?? 'ts'
  const lang = LANGS.get(extension) ?? 'ts'

  const parsed = parseSync(filename, code, { sourceType: 'module', lang })
  if (parsed.errors.length > 0) {
    throw new Error(
      `best-i18n: failed to parse ${filename}: ${parsed.errors[0]?.message}`,
    )
  }

  const staticImports = (parsed.module?.staticImports ?? []) as StaticImport[]

  const { locals, namespaces } = resolveMacroBindings({
    staticImports,
    from,
    exportName: tag,
  })
  const { locals: hookLocals, namespaces: hookNamespaces } =
    resolveMacroBindings({
      staticImports,
      from: hookFrom,
      exportName: hook,
    })
  const { locals: componentLocals, namespaces: componentNamespaces } =
    resolveMacroBindings({
      staticImports,
      from: componentFrom,
      exportName: component,
    })

  const namespaced = [...namespaces, ...hookNamespaces, ...componentNamespaces]

  if (namespaced.length > 0) {
    throw new Error(
      `best-i18n: ${filename} imports a macro module as a namespace ` +
        `(${namespaced.join(', ')}). Import the macro directly so it can be ` +
        'resolved.',
    )
  }

  const { end: directiveEnd, directives } = directivePrologue(parsed.program)

  if (
    locals.size === 0 &&
    hookLocals.size === 0 &&
    componentLocals.size === 0
  ) {
    return { messages: [], hookCalls: [], directiveEnd, directives }
  }

  const messages: Message[] = []
  const hookCalls: HookCall[] = []
  const tagNodes = new Set<unknown>()

  // `const t = useI18n()` declares a locale-holding variable. Matching later
  // tag uses is by scope, not by name across the file: an imported macro that
  // happens to share the variable's name must not be compiled against it, and
  // an unrelated same-named variable in another function is not a misuse.
  const localeVars = new Set<string>()
  const allowedHookNodes = new Set<unknown>()
  const scopes: Scope[] = []

  walk(parsed.program, (node) => {
    if (FUNCTIONS.has(node.type as string)) {
      scopes.push({ start: node.start as number, end: node.end as number })
      return
    }

    if (node.type !== 'VariableDeclarator') return

    const init = node.init as
      | {
          type?: string
          callee?: { type?: string; name?: string; start?: number }
          start?: number
          end?: number
          arguments?: unknown[]
        }
      | null
      | undefined
    if (init?.type !== 'CallExpression') return
    if (init.callee?.type !== 'Identifier') return
    if (!hookLocals.has(init.callee.name ?? '')) return

    const id = node.id as { type?: string; name?: string; start?: number }
    if (id.type !== 'Identifier') {
      throw new Error(
        `best-i18n: ${hook}() must be assigned to a plain variable ` +
          `(${filename} offset ${id.start ?? 0}). Destructuring is not ` +
          'supported.',
      )
    }

    localeVars.add(id.name ?? '')
    allowedHookNodes.add(node.id)
    allowedHookNodes.add(init.callee)
    hookCalls.push({
      start: init.start as number,
      end: init.end as number,
      name: id.name ?? '',
    })
  })

  /** The innermost function containing `offset`, of those that qualify. */
  const innermost = (offset: number, of: Scope[]): Scope | undefined => {
    let found: Scope | undefined
    for (const scope of of) {
      if (offset < scope.start || offset >= scope.end) continue
      if (found === undefined || scope.start > found.start) found = scope
    }
    return found
  }

  // A hook variable belongs to the function that declares it. Closures see it
  // too, which is why the lookup below walks outwards rather than demanding an
  // exact match. A call outside any function claims the whole module.
  let moduleScope: Scope | undefined
  for (const call of hookCalls) {
    let scope = innermost(call.start, scopes)
    if (scope === undefined) {
      moduleScope ??= { start: 0, end: code.length }
      scope = moduleScope
    }
    scope.localeVar = call.name
  }
  if (moduleScope !== undefined) scopes.push(moduleScope)

  const withLocaleVar = scopes.filter((scope) => scope.localeVar !== undefined)

  /**
   * The hook variable named `name` visible at `offset`, if any. Scope-aware on
   * purpose: `t` from `useI18n()` in one component and an imported macro `t`
   * used in the next are different bindings, and compiling the macro against
   * the hook variable would emit a locale check that reads a function.
   */
  const hookScopeAt = (offset: number, name: string): Scope | undefined =>
    innermost(
      offset,
      withLocaleVar.filter((scope) => scope.localeVar === name),
    )

  walk(parsed.program, (node) => {
    if (node.type !== 'TaggedTemplateExpression') return

    const tagNode = node.tag as { type?: string; name?: string } | undefined
    if (tagNode?.type !== 'Identifier') return
    const name = tagNode.name ?? ''
    const isHookVar = hookScopeAt(node.start as number, name) !== undefined
    if (!locals.has(name) && !isHookVar) return
    tagNodes.add(node.tag)

    const quasi = node.quasi as {
      quasis: Array<{ value: { cooked: string | null; raw: string } }>
      expressions: Array<{ start: number; end: number }>
    }

    const expressions = quasi.expressions.map((expression) =>
      code.slice(expression.start, expression.end),
    )

    const text = quasi.quasis
      .map((piece, index) => {
        const chunk = piece.value.cooked ?? piece.value.raw
        return index < expressions.length ? `${chunk}{${index}}` : chunk
      })
      .join('')

    const start = node.start as number

    messages.push({
      text,
      expressions,
      start,
      end: node.end as number,
      line: lineAt(code, start),
      ...(isHookVar ? { localeVar: name } : {}),
    })
  })

  walk(parsed.program, (node, parent) => {
    if (node.type !== 'JSXElement') return

    const opening = node.openingElement as
      | {
          name?: { type?: string; name?: string }
          attributes?: unknown[]
          selfClosing?: boolean
        }
      | undefined

    if (opening?.name?.type !== 'JSXIdentifier') return
    if (!componentLocals.has(opening.name.name ?? '')) return

    const start = node.start as number

    // Attributes would have to survive translation, and none of them can:
    // there is nowhere in the message to put them. `key` included - wrap the
    // <Trans> in the element that needs it.
    if ((opening.attributes?.length ?? 0) > 0) {
      throw new Error(
        `best-i18n: <${component}> takes no props (${filename} offset ` +
          `${start}). Wrap it in an element if you need one.`,
      )
    }

    if (opening.selfClosing === true) {
      throw new Error(
        `best-i18n: <${component} /> is empty (${filename} offset ${start}). ` +
          'A message needs content.',
      )
    }

    const { text, expressions, elements } = serializeTrans(
      node.children as unknown[],
      code,
      filename,
    )

    // A `<Trans>` inside a component that already calls `useI18n()` reads that
    // variable, so it re-renders on a locale change like the tagged templates
    // around it - and, in a client component, gets its locale from the same
    // place they do. Without one it falls back to `getLocale()`.
    const localeVar = innermost(start, withLocaleVar)?.localeVar

    messages.push({
      text,
      expressions,
      elements,
      start,
      end: node.end as number,
      line: lineAt(code, start),
      ...(localeVar === undefined ? {} : { localeVar }),
      // Among JSX children the replacement has to stay an expression; anywhere
      // else - a variable, a prop, a return - it already is one.
      braced: parent?.type === 'JSXElement' || parent?.type === 'JSXFragment',
    })
  })

  // Any other reference to the binding cannot be compiled: `const f = t`,
  // `foo(t)`, or a local that shadows it. Fail here instead of leaving a
  // runtime throw for someone to find in production.
  walk(parsed.program, (node, parent) => {
    if (node.type !== 'Identifier') return
    const name = node.name as string
    if (
      !locals.has(name) &&
      !hookLocals.has(name) &&
      !componentLocals.has(name)
    ) {
      if (!localeVars.has(name)) return
      // A hook variable's name is only reserved inside the function that
      // declared it; an unrelated variable elsewhere in the file is fine.
      if (hookScopeAt(node.start as number, name) === undefined) return
    }
    if (tagNodes.has(node)) return
    if (allowedHookNodes.has(node)) return
    if (isNonReferencePosition(parent, node)) return

    throw new Error(
      `best-i18n: \`${name}\` is a compile-time macro and can only be ` +
        `used as a tagged template (${filename} offset ` +
        `${node.start as number}). It cannot be stored, passed, or shadowed.`,
    )
  })

  messages.sort((a, b) => a.start - b.start)

  // A nested macro - `t` inside a `<Trans>`, or one `<Trans>` inside another -
  // shows up as a message whose range sits inside another one. Rewriting both
  // would corrupt the output, so refuse it explicitly.
  for (let index = 1; index < messages.length; index++) {
    const previous = messages[index - 1]!
    const current = messages[index]!

    if (current.start < previous.end) {
      throw new Error(
        `best-i18n: nested messages in ${filename} are not supported (at ` +
          `offset ${current.start}). A ${tag}\`\` or <${component}> cannot ` +
          'contain another one.',
      )
    }
  }

  return { messages, hookCalls, directiveEnd, directives }
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
  const from = options.from ?? DEFAULT_FROM
  const hookFrom = options.hookFrom ?? DEFAULT_HOOK_FROM
  const componentFrom = options.componentFrom ?? DEFAULT_COMPONENT_FROM

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
  const imports = [...from, ...hookFrom, ...componentFrom]
  if (!imports.some((specifier) => code.includes(specifier))) return null

  const { messages, hookCalls, directiveEnd, directives } = analyze(
    code,
    filename,
    {
      tag,
      from: options.from,
      hook: options.hook,
      hookFrom: options.hookFrom,
      component: options.component,
      componentFrom: options.componentFrom,
    },
  )
  if (messages.length === 0 && hookCalls.length === 0) return null

  const runtimeModule = options.runtimeModule ?? 'best-i18n/runtime'
  const reactModule = options.reactModule ?? 'best-i18n/react'
  const missing: TransformResult['missing'] = []
  const source = new MagicString(code)
  let needsRuntime = false
  let needsReact = false

  // Never inject a bare name: the file may already import or define one
  // (a locale switcher does), which is a duplicate-declaration parse error.
  let localGetLocale = '__i18nGetLocale'
  for (let suffix = 2; code.includes(localGetLocale); suffix++) {
    localGetLocale = `__i18nGetLocale${suffix}`
  }
  let localUseLocale = '__i18nUseLocale'
  for (let suffix = 2; code.includes(localUseLocale); suffix++) {
    localUseLocale = `__i18nUseLocale${suffix}`
  }

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
    } else {
      source.overwrite(call.start, call.end, `${localUseLocale}()`)
      needsReact = true
    }
  }

  const textFor = (message: Message, locale: string): string => {
    const entry = options.catalog[message.text]
    const value = entry?.[locale]

    if (value === undefined) {
      if (locale !== options.baseLocale) {
        missing.push({ text: message.text, locale })
      }
      return entry?.[options.baseLocale] ?? message.text
    }

    return value
  }

  for (const message of messages) {
    let replacement: string

    // `<Trans>` rebuilds markup; `t` only ever produces a template literal.
    // Both validate the translation's placeholders against the source first:
    // a dropped or invented `{n}` must fail here, named, not ship silently.
    const render =
      message.elements === undefined
        ? (text: string, locale: string) => {
            validateTemplateTranslation(
              text,
              message.text,
              `${filename}:${message.line} (${locale}) "${message.text}"`,
            )
            return renderTemplate(text, message.expressions)
          }
        : (text: string, locale: string) =>
            renderTrans(
              text,
              message.expressions,
              message.elements!,
              `${filename}:${message.line} (${locale}) "${message.text}"`,
            )

    if (options.staticLocale !== undefined) {
      replacement = render(
        textFor(message, options.staticLocale),
        options.staticLocale,
      )
    } else {
      const others = options.locales.filter(
        (locale) => locale !== options.baseLocale,
      )

      const base = render(
        textFor(message, options.baseLocale),
        options.baseLocale,
      )

      if (others.length === 0) {
        replacement = base
      } else {
        // A ternary chain, not an object literal and not an IIFE: nothing is
        // allocated per render. Hook-bound messages compare the variable that
        // already holds the locale; others call getLocale().
        const localeExpr =
          message.localeVar !== undefined
            ? message.localeVar
            : `${localGetLocale}()`

        const branches = others
          .map(
            (locale) =>
              `${localeExpr} === ${JSON.stringify(locale)} ? ${render(
                textFor(message, locale),
                locale,
              )} : `,
          )
          .join('')

        replacement = `(${branches}${base})`
        if (message.localeVar === undefined) needsRuntime = true
      }
    }

    source.overwrite(
      message.start,
      message.end,
      // Among JSX children the result has to be braced to stay an expression.
      message.braced === true ? `{${replacement}}` : replacement,
    )
  }

  const inject = (statement: string) => {
    if (directiveEnd === 0) {
      source.prepend(`${statement};\n`)
    } else {
      source.appendLeft(directiveEnd, `\n${statement};`)
    }
  }

  if (needsRuntime) {
    inject(
      `import { getLocale as ${localGetLocale} } from ${JSON.stringify(
        runtimeModule,
      )}`,
    )
  }

  if (needsReact) {
    inject(
      `import { useLocale as ${localUseLocale} } from ${JSON.stringify(
        reactModule,
      )}`,
    )
  }

  return {
    code: source.toString(),
    map: source.generateMap({ hires: true, source: filename }),
    messages,
    missing,
    directives,
  }
}
