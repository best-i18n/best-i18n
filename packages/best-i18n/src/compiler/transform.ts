import MagicString from 'magic-string'
import { parseSync } from 'oxc-parser'

import { isNonReferencePosition, resolveMacroBindings } from './bindings.ts'
import { GERMANIC } from './plural.ts'
import {
  renderTemplate,
  renderTrans,
  serializeTrans,
  tokenForExpression,
  validatePluralForm,
  validateTemplateTranslation,
} from './trans.ts'

import type { StaticImport, StaticImportEntry } from './bindings.ts'
import type { PluralRule } from './plural.ts'
import type { TransElement } from './trans.ts'

export interface Message {
  /** Source text with named placeholders, e.g. `Hi {name}`. */
  text: string
  /** Source of each interpolated expression, deduplicated. */
  expressions: string[]
  /** Token for each expression, in parallel: `name` for `${name}`, else `0`. */
  placeholders: string[]
  /**
   * `msgctxt` - disambiguates two messages with identical text that must
   * translate differently. Empty for none.
   */
  context: string
  /** A `// i18n:` comment above the message, for the translator (`#.`). */
  description?: string
  /**
   * Set for `plural(count, one, other)`: `text` holds the singular form,
   * `other` the plural one, `count` the expression the forms dispatch on.
   */
  plural?: { count: string; other: string }
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

/**
 * An import declaration naming a macro module, so the transform can drop the
 * compiled-away bindings. The runtime halves of the macros are throwing stubs;
 * leaving the import in would keep them in every bundle.
 */
interface MacroImport {
  start: number
  end: number
  /** Source text of the module specifier, quotes included. */
  request: string
  entries: Array<{
    /** A macro binding, gone after the transform. */
    macro: boolean
    type: boolean
    kind: string
    imported: string | undefined
    local: string
  }>
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

/**
 * The catalog key for a message: the source text, prefixed by the context
 * when there is one (separated by an EOT, gettext's own convention), and
 * suffixed by the plural form for plural entries. Context-free singular
 * messages are keyed by their bare text, which is the common case.
 */
export function catalogKey(
  context: string,
  text: string,
  pluralText?: string,
): string {
  const base = context === '' ? text : `${context}\u0004${text}`
  return pluralText === undefined ? base : `${base}\u0005${pluralText}`
}

export interface TransformOptions {
  /** Every locale. `baseLocale` is the fallback for missing translations. */
  locales: string[]
  baseLocale: string
  /**
   * `catalogKey(context, text, plural) -> locale -> translation`.
   *
   * Keyed by the source text, not by an id: the transform therefore never
   * computes an id, so it cannot disagree with the extractor about how
   * entries are keyed. A plural entry's value is its `msgstr[n]` array.
   */
  catalog: Record<string, Record<string, string | string[]> | undefined>
  /**
   * Per-locale plural rule, from each catalog's `Plural-Forms` header (via
   * `loadCatalog`). A locale with no rule falls back to the Germanic one,
   * exactly as GNU gettext does.
   */
  plurals?: Record<string, PluralRule>
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
  /** Name of the plural macro export, resolved from the same `from`. */
  plural?: string
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

/**
 * Every module specifier whose presence in a file means it may contain a
 * message. The one text-level signal a bundler can prefilter on - Rolldown's
 * hook filters use it to skip the JS plugin entirely for the other files.
 */
export function macroSpecifiers(
  options: Pick<TransformOptions, 'from' | 'hookFrom' | 'componentFrom'>,
): string[] {
  return [
    ...new Set([
      ...(options.from ?? DEFAULT_FROM),
      ...(options.hookFrom ?? DEFAULT_HOOK_FROM),
      ...(options.componentFrom ?? DEFAULT_COMPONENT_FROM),
    ]),
  ]
}

type Lang = 'ts' | 'tsx' | 'js' | 'jsx'

// Plain `.js` (and `.mjs`/`.cjs`) parses as JSX: Next.js and CRA-style code
// put JSX in `.js` routinely, and JSX is a syntactic superset of JS, so
// nothing is lost by assuming it. TypeScript is the opposite - JSX in `.ts`
// is ambiguous with type assertions - so only `.tsx` gets it there.
const LANGS = new Map<string, Lang>([
  ['ts', 'ts'],
  ['tsx', 'tsx'],
  ['mts', 'ts'],
  ['cts', 'ts'],
  ['js', 'jsx'],
  ['jsx', 'jsx'],
  ['mjs', 'jsx'],
  ['cjs', 'jsx'],
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
  plural?: string
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

interface TemplatePiece {
  value: { cooked: string | null; raw: string }
}

/**
 * The message text of a template literal, with interpolations replaced by
 * `{token}` placeholders registered in the shared pools.
 *
 * A line break that exists in the source - as opposed to a written `\n`
 * escape, which is not a real newline in `raw` - is code formatting, not
 * message content. It collapses, with the indentation around it, to one
 * space, the way <Trans> already treats JSX text, so re-indenting a component
 * never changes a msgid and orphans its translations.
 */
function templateText(
  quasis: TemplatePiece[],
  expressionSources: string[],
  expressions: string[],
  placeholders: string[],
): string {
  return quasis
    .map((piece, index) => {
      let chunk = piece.value.cooked ?? piece.value.raw
      if (/[\r\n]/.test(piece.value.raw)) {
        chunk = chunk.replace(/[ \t]*(?:\r\n|\n|\r)[ \t]*/g, ' ')
      }
      if (index < expressionSources.length) {
        const token = tokenForExpression(
          expressionSources[index]!,
          expressions,
          placeholders,
        )
        return `${chunk}{${token}}`
      }
      return chunk
    })
    .join('')
}

/** Shared by extract() and transform(): messages plus useI18n() call sites. */
function analyze(
  code: string,
  filename: string,
  options: ExtractOptions = {},
): {
  messages: Message[]
  hookCalls: HookCall[]
  macroImports: MacroImport[]
  directiveEnd: number
  directives: string[]
} {
  const tag = options.tag ?? 't'
  const from = options.from ?? DEFAULT_FROM
  const pluralName = options.plural ?? 'plural'
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
  const { locals: pluralLocals } = resolveMacroBindings({
    staticImports,
    from,
    exportName: pluralName,
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

  const namespaced = [
    ...new Set([...namespaces, ...hookNamespaces, ...componentNamespaces]),
  ]

  if (namespaced.length > 0) {
    throw new Error(
      `best-i18n: ${filename} imports a macro module as a namespace ` +
        `(${namespaced.join(', ')}). Import the macro directly so it can be ` +
        'resolved.',
    )
  }

  const { end: directiveEnd, directives } = directivePrologue(parsed.program)

  // Which export of which module family is a macro. Matching mirrors
  // resolveMacroBindings: literal specifier, named (non-type) imports only.
  const isMacroEntry = (module: string, entry: StaticImportEntry): boolean => {
    if (entry.isType || entry.importName.kind !== 'Name') return false
    const name = entry.importName.name
    return (
      (from.includes(module) && (name === tag || name === pluralName)) ||
      (hookFrom.includes(module) && name === hook) ||
      (componentFrom.includes(module) && name === component)
    )
  }

  const macroImports: MacroImport[] = staticImports
    .filter((declaration) =>
      declaration.entries.some((entry) =>
        isMacroEntry(declaration.moduleRequest.value, entry),
      ),
    )
    .map((declaration) => ({
      start: declaration.start,
      end: declaration.end,
      request: code.slice(
        declaration.moduleRequest.start,
        declaration.moduleRequest.end,
      ),
      entries: declaration.entries.map((entry) => ({
        macro: isMacroEntry(declaration.moduleRequest.value, entry),
        type: entry.isType,
        kind: entry.importName.kind,
        imported: entry.importName.name,
        local: entry.localName.value,
      })),
    }))

  if (
    locals.size === 0 &&
    pluralLocals.size === 0 &&
    hookLocals.size === 0 &&
    componentLocals.size === 0
  ) {
    return {
      messages: [],
      hookCalls: [],
      macroImports,
      directiveEnd,
      directives,
    }
  }

  // `// i18n: why this wording` above a message becomes a `#.` comment in the
  // catalogs - the translator's context, kept next to the code it describes.
  const notes: Array<{ line: number; text: string }> = []
  for (const comment of (parsed.comments ?? []) as Array<{
    value: string
    end: number
  }>) {
    const match = /^\s*i18n:\s*([\s\S]+?)\s*$/.exec(comment.value)
    if (match === null) continue
    notes.push({ line: lineAt(code, comment.end), text: match[1]! })
  }

  const descriptionFor = (messageLine: number): string | undefined => {
    const attached = notes.filter(
      (note) => note.line === messageLine - 1 || note.line === messageLine,
    )
    if (attached.length === 0) return undefined
    return attached.map((note) => note.text).join('\n')
  }

  const messages: Message[] = []
  const hookCalls: HookCall[] = []
  const tagNodes = new Set<unknown>()
  const allowedPluralNodes = new Set<unknown>()

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

    // The tag is either the bare macro - t`...` - or a context call:
    // t.ctx('verb')`...`, which disambiguates two identical texts (msgctxt).
    const tagNode = node.tag as
      | {
          type?: string
          name?: string
          callee?: {
            type?: string
            computed?: boolean
            object?: { type?: string; name?: string }
            property?: { type?: string; name?: string }
          }
          arguments?: Array<{ type?: string; value?: unknown }>
        }
      | undefined

    let nameNode: { type?: string; name?: string } | undefined
    if (tagNode?.type === 'Identifier') {
      nameNode = tagNode
    } else if (tagNode?.type === 'CallExpression') {
      const callee = tagNode.callee
      if (callee?.type !== 'MemberExpression') return
      if (callee.computed === true) return
      if (callee.property?.type !== 'Identifier') return
      if (callee.property.name !== 'ctx') return
      if (callee.object?.type !== 'Identifier') return
      nameNode = callee.object
    } else {
      return
    }

    const name = nameNode.name ?? ''
    const isHookVar = hookScopeAt(node.start as number, name) !== undefined
    if (!locals.has(name) && !isHookVar) return

    let context = ''
    if (tagNode!.type === 'CallExpression') {
      const args = tagNode!.arguments ?? []
      const argument = args[0]
      if (
        args.length !== 1 ||
        argument?.type !== 'Literal' ||
        typeof argument.value !== 'string' ||
        argument.value === ''
      ) {
        throw new Error(
          `best-i18n: ${name}.ctx() takes exactly one non-empty string ` +
            `literal (${filename} offset ${node.start as number}) - the ` +
            'context has to be statically visible.',
        )
      }
      context = argument.value
    }

    tagNodes.add(nameNode)

    const quasi = node.quasi as {
      quasis: TemplatePiece[]
      expressions: Array<{ start: number; end: number }>
    }

    const expressionSources = quasi.expressions.map((expression) =>
      code.slice(expression.start, expression.end),
    )

    const expressions: string[] = []
    const placeholders: string[] = []
    const text = templateText(
      quasi.quasis,
      expressionSources,
      expressions,
      placeholders,
    )

    const start = node.start as number
    const line = lineAt(code, start)
    const description = descriptionFor(line)

    messages.push({
      text,
      expressions,
      placeholders,
      context,
      ...(description === undefined ? {} : { description }),
      start,
      end: node.end as number,
      line,
      ...(isHookVar ? { localeVar: name } : {}),
    })
  })

  // plural(count, `One item`, `${count} items`) - the gettext plural pair.
  walk(parsed.program, (node) => {
    if (node.type !== 'CallExpression') return

    const callee = node.callee as { type?: string; name?: string } | undefined
    if (callee?.type !== 'Identifier') return
    if (!pluralLocals.has(callee.name ?? '')) return

    allowedPluralNodes.add(callee)

    const start = node.start as number
    const args = (node.arguments ?? []) as Array<Record<string, unknown>>

    if (
      args.length !== 3 ||
      args.some((argument) => argument.type === 'SpreadElement')
    ) {
      throw new Error(
        `best-i18n: ${pluralName}(count, one, other) takes exactly three ` +
          `arguments (${filename} offset ${start}).`,
      )
    }

    const [countNode, oneNode, otherNode] = args
    const count = code.slice(
      countNode!.start as number,
      countNode!.end as number,
    )

    const expressions: string[] = []
    const placeholders: string[] = []
    // The count is always addressable in a translation - `{n}` in a Chinese
    // single form, say - whether or not the source forms interpolate it.
    tokenForExpression(count, expressions, placeholders)

    const formText = (form: Record<string, unknown>, which: string): string => {
      if (form.type === 'Literal' && typeof form.value === 'string') {
        return form.value
      }
      if (form.type === 'TemplateLiteral') {
        const sources = (
          form.expressions as Array<{ start: number; end: number }>
        ).map((expression) => code.slice(expression.start, expression.end))
        return templateText(
          form.quasis as TemplatePiece[],
          sources,
          expressions,
          placeholders,
        )
      }
      throw new Error(
        `best-i18n: the ${which} form of ${pluralName}() must be a template ` +
          `literal or string literal (${filename} offset ${start}) - the ` +
          'message has to be statically visible.',
      )
    }

    const one = formText(oneNode!, 'singular')
    const other = formText(otherNode!, 'plural')

    const line = lineAt(code, start)
    const description = descriptionFor(line)
    // Inside a component that called useI18n(), dispatch on its variable so
    // the message re-renders on locale change and is client-safe on Next.
    const localeVar = innermost(start, withLocaleVar)?.localeVar

    messages.push({
      text: one,
      plural: { count, other },
      expressions,
      placeholders,
      context: '',
      ...(description === undefined ? {} : { description }),
      start,
      end: node.end as number,
      line,
      ...(localeVar === undefined ? {} : { localeVar }),
    })
  })

  walk(parsed.program, (node, parent) => {
    if (node.type !== 'JSXElement') return

    const opening = node.openingElement as
      | {
          name?: { type?: string; name?: string }
          attributes?: Array<Record<string, unknown>>
          selfClosing?: boolean
        }
      | undefined

    if (opening?.name?.type !== 'JSXIdentifier') return
    if (!componentLocals.has(opening.name.name ?? '')) return

    const start = node.start as number

    // Attributes would have to survive translation, and none of them can:
    // there is nowhere in the message to put them. `key` included - wrap the
    // <Trans> in the element that needs it. `ctx` is the one exception: it is
    // message metadata, not a prop.
    let context = ''
    for (const attribute of opening.attributes ?? []) {
      const attributeName = (attribute.name as { name?: string } | undefined)
        ?.name
      if (attribute.type === 'JSXAttribute' && attributeName === 'ctx') {
        const value = attribute.value as
          { type?: string; value?: unknown } | null | undefined
        if (
          value?.type !== 'Literal' ||
          typeof value.value !== 'string' ||
          value.value === ''
        ) {
          throw new Error(
            `best-i18n: <${component} ctx> must be a non-empty string ` +
              `literal (${filename} offset ${start}).`,
          )
        }
        context = value.value
        continue
      }
      throw new Error(
        `best-i18n: <${component}> takes no props other than ctx ` +
          `(${filename} offset ${start}). Wrap it in an element if you ` +
          'need one.',
      )
    }

    if (opening.selfClosing === true) {
      throw new Error(
        `best-i18n: <${component} /> is empty (${filename} offset ${start}). ` +
          'A message needs content.',
      )
    }

    const { text, expressions, placeholders, elements } = serializeTrans(
      node.children as unknown[],
      code,
      filename,
    )

    // A `<Trans>` inside a component that already calls `useI18n()` reads that
    // variable, so it re-renders on a locale change like the tagged templates
    // around it - and, in a client component, gets its locale from the same
    // place they do. Without one it falls back to `getLocale()`.
    const localeVar = innermost(start, withLocaleVar)?.localeVar

    const line = lineAt(code, start)
    const description = descriptionFor(line)

    messages.push({
      text,
      expressions,
      placeholders,
      elements,
      context,
      ...(description === undefined ? {} : { description }),
      start,
      end: node.end as number,
      line,
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
      !pluralLocals.has(name) &&
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
    if (allowedPluralNodes.has(node)) return
    if (isNonReferencePosition(parent, node)) return

    throw new Error(
      `best-i18n: \`${name}\` is a compile-time macro and can only be ` +
        `used at its call site (${filename} offset ` +
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
          `offset ${current.start}). A ${tag}\`\`, ${pluralName}() or ` +
          `<${component}> cannot contain another one.`,
      )
    }
  }

  return { messages, hookCalls, macroImports, directiveEnd, directives }
}

const TOKEN_PATTERN = /(?<!\$)\{([A-Za-z0-9_$]+)\}/g

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

  const { messages, hookCalls, macroImports, directiveEnd, directives } =
    analyze(code, filename, {
      tag,
      from: options.from,
      plural: options.plural,
      hook: options.hook,
      hookFrom: options.hookFrom,
      component: options.component,
      componentFrom: options.componentFrom,
    })
  if (messages.length === 0 && hookCalls.length === 0) return null

  const runtimeModule = options.runtimeModule ?? 'best-i18n/runtime'
  const reactModule = options.reactModule ?? 'best-i18n/react'
  const missing: TransformResult['missing'] = []
  const source = new MagicString(code)
  let needsRuntime = false
  let needsReact = false

  // The macro bindings compile away with their call sites, so their imports
  // go too. Left in place they would keep the throwing runtime stubs in every
  // bundle: without a `sideEffects` hint a bundler must assume the import
  // matters. Misuse that would leave a live reference - `const p = plural` -
  // is already a build error, so a surviving reference is impossible here.
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

  // Never inject a bare name: the file may already import or define one
  // (a locale switcher does), which is a duplicate-declaration parse error.
  const hygienic = (base: string): string => {
    let name = base
    for (let suffix = 2; code.includes(name); suffix++) {
      name = `${base}${suffix}`
    }
    return name
  }
  const localGetLocale = hygienic('__i18nGetLocale')
  const localUseLocale = hygienic('__i18nUseLocale')
  const localN = hygienic('__i18nN')
  const localI = hygienic('__i18nI')

  const ruleFor = (locale: string) => options.plurals?.[locale] ?? GERMANIC

  const others = options.locales.filter(
    (locale) => locale !== options.baseLocale,
  )

  // How many call sites share a catalog entry. A message repeated within one
  // module hoists into a single module-level function - the translations are
  // emitted once, each call site pays one call. Only the multi-locale ternary
  // form is worth it: under `staticLocale` (and a single-locale config) the
  // message is already a bare literal, and a <Trans> branch captures
  // call-site JSX that a shared function could not.
  const repeats = new Map<string, number>()
  if (options.staticLocale === undefined && others.length > 0) {
    for (const message of messages) {
      if (message.elements !== undefined) continue
      const key = catalogKey(
        message.context,
        message.text,
        message.plural?.other,
      )
      repeats.set(key, (repeats.get(key) ?? 0) + 1)
    }
  }
  const hoistPrefix = hygienic('__i18nM')
  const hoistedNames = new Map<string, string>()
  const hoistedDecls: string[] = []

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

  // Compiles one message to its replacement expression. `localeExpr` is what
  // the ternary compares: the hook variable, a `getLocale()` call, or a
  // hoisted function's own locale parameter.
  const compileMessage = (message: Message, localeExpr: string): string => {
    const describe = (locale: string) =>
      `${filename}:${message.line} (${locale}) "${message.text}"`

    const entry =
      options.catalog[
        catalogKey(message.context, message.text, message.plural?.other)
      ]

    // What a locale renders when it has no (valid) translation: the source.
    const sourceValue: string | string[] =
      message.plural === undefined
        ? message.text
        : [message.text, message.plural.other]

    const valueFor = (locale: string): string | string[] => {
      const value = entry?.[locale]

      const valid =
        message.plural === undefined
          ? typeof value === 'string'
          : Array.isArray(value) &&
            value.length === ruleFor(locale).nplurals &&
            value.every((form) => form !== '')

      if (!valid) {
        if (locale !== options.baseLocale) {
          missing.push({ text: message.text, locale })
        }
        return sourceValue
      }

      return value as string | string[]
    }

    // Tokens a plural form may use: every placeholder, plus any literal
    // `{...}` the source forms themselves carry.
    const allowedTokens = new Set(message.placeholders)
    if (message.plural !== undefined) {
      const combined = `${message.text}\u0000${message.plural.other}`
      for (const match of combined.matchAll(TOKEN_PATTERN)) {
        allowedTokens.add(match[1]!)
      }
    }

    // `<Trans>` rebuilds markup; `t` produces a template literal; `plural`
    // produces a per-locale form dispatch. All three validate the
    // translation's placeholders against the source first: a dropped or
    // invented `{name}` must fail here, named, not ship silently.
    const render = (value: string | string[], locale: string): string => {
      if (message.plural !== undefined) {
        const forms = Array.isArray(value) ? value : [value]
        for (const form of forms) {
          validatePluralForm(form, allowedTokens, describe(locale))
        }

        const rendered = forms.map((form) =>
          renderTemplate(form, message.expressions, message.placeholders),
        )
        if (rendered.length === 1) return rendered[0]!

        // The locale's gettext formula, inlined. `+()` because a two-form
        // formula like `n != 1` evaluates to a boolean, which is an index in
        // C but not under `===` in JavaScript.
        const formula = ruleFor(locale).formula.replace(/\bn\b/g, localN)
        const branches = rendered
          .slice(1)
          .map((form, index) => `${localI} === ${index + 1} ? ${form} : `)
          .join('')

        return (
          `((${localN}, ${localI} = +(${formula})) => ` +
          `${branches}${rendered[0]!})(${message.plural.count})`
        )
      }

      const text = value as string
      if (message.elements === undefined) {
        validateTemplateTranslation(text, message.text, describe(locale))
        return renderTemplate(text, message.expressions, message.placeholders)
      }
      return renderTrans(
        text,
        message.expressions,
        message.placeholders,
        message.elements,
        describe(locale),
      )
    }

    if (options.staticLocale !== undefined) {
      return render(valueFor(options.staticLocale), options.staticLocale)
    }

    const base = render(valueFor(options.baseLocale), options.baseLocale)
    if (others.length === 0) return base

    // A ternary chain, not an object literal and not an IIFE: nothing is
    // allocated per render.
    const branches = others
      .map(
        (locale) =>
          `${localeExpr} === ${JSON.stringify(locale)} ? ${render(
            valueFor(locale),
            locale,
          )} : `,
      )
      .join('')

    return `(${branches}${base})`
  }

  for (const message of messages) {
    const key = catalogKey(message.context, message.text, message.plural?.other)
    let replacement: string

    if ((repeats.get(key) ?? 0) >= 2 && message.elements === undefined) {
      let name = hoistedNames.get(key)

      if (name === undefined) {
        name = `${hoistPrefix}${hoistedNames.size + 1}`
        hoistedNames.set(key, name)

        // The inline form splices call-site expression source into the
        // template, which cannot leave its scope - so the hoisted function
        // takes the locale and one parameter per expression instead. A shared
        // msgid guarantees a shared placeholder set, so every call site
        // agrees on the arity. Validation (and `missing`) runs once per
        // hoisted message, not once per call site.
        const params = message.expressions.map((_, index) => `e${index}`)
        const lifted: Message = {
          ...message,
          expressions: params,
          plural:
            message.plural === undefined
              ? undefined
              : {
                  ...message.plural,
                  count:
                    params[message.expressions.indexOf(message.plural.count)]!,
                },
        }
        hoistedDecls.push(
          `const ${name} = (${['l', ...params].join(', ')}) => ${compileMessage(
            lifted,
            'l',
          )}`,
        )
      }

      // Hook-bound call sites pass the variable that already holds the
      // locale; others read it at call time, so one function serves both.
      const args = [
        message.localeVar ?? `${localGetLocale}()`,
        ...message.expressions,
      ]
      if (message.localeVar === undefined) needsRuntime = true
      replacement = `${name}(${args.join(', ')})`
    } else {
      replacement = compileMessage(
        message,
        message.localeVar ?? `${localGetLocale}()`,
      )
      if (
        message.localeVar === undefined &&
        options.staticLocale === undefined &&
        others.length > 0
      ) {
        needsRuntime = true
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

  for (const declaration of hoistedDecls) {
    inject(declaration)
  }

  return {
    code: source.toString(),
    map: source.generateMap({ hires: true, source: filename }),
    messages,
    missing,
    directives,
  }
}
