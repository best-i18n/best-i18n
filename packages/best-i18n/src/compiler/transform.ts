import { MagicString } from 'magic-string'
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
  /**
   * Set for a `<Trans>` in a position that takes a React element: JSX children,
   * or returned straight from a function. Such a message can be compiled into a
   * generated component, which is the only place a client module may read the
   * locale through React. Anywhere else the message may be wanted as a string
   * (`alt={...}`, a template literal), and an element would render as
   * `[object Object]`.
   */
  elementOk?: boolean
}

interface HookCall {
  /** Range of the `useI18n()` call expression, to be rewritten. */
  start: number
  end: number
  /** Variable it was assigned to, which becomes the locale in that scope. */
  name: string
  /**
   * A locale variable already read earlier in the same function, which this
   * call aliases instead of subscribing again. See `localeAliases`.
   */
  alias?: string
}

/**
 * One `const x = useLocale()` the module wrote itself: the range of the call
 * and the variable it feeds.
 */
interface LocaleRead {
  start: number
  end: number
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

/**
 * Where a rejected macro reference is explained at length. Kept next to the
 * error rather than in a docs config: it ships inside the message, so it has
 * to be here to be reviewable in a diff.
 */
const MACRO_MISUSE_DOCS =
  'https://best-i18n.aiwan.run/docs/errors/dependency-array'

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
  /**
   * Messages in a `'use client'` module that still read the ambient locale,
   * because neither a hook variable nor a generated component could bind them.
   * Empty everywhere else, including per-locale builds.
   *
   * On Next.js this is a build error rather than a warning - a client module is
   * rendered from two module graphs, and only the browser's has a locale, so
   * the page ships in the base language and flips after hydration. The
   * compiler reports the fact; the integration decides what it means, because
   * a client-only bundler has no second graph and no such hazard.
   */
  clientUnbound: Array<{ text: string; line: number }>
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
  /** Only to recognize the runtime `useLocale` - see `localeAliases`. */
  reactModule?: string
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
      | { type?: string; value?: unknown }
      | undefined
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
  localeAliases: Array<{ start: number; end: number; text: string }>
  /** See `reusableLocaleRead`. */
  reusableLocaleRead?: string
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

  // The runtime read that `useI18n()` compiles into. Recognizing the module's
  // own calls is what lets one component share a single subscription.
  const { locals: localeReadLocals } = resolveMacroBindings({
    staticImports,
    from: [options.reactModule ?? 'best-i18n/react'],
    exportName: 'useLocale',
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
      localeAliases: [],
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
  const localeReads: LocaleRead[] = []

  walk(parsed.program, (node, parent) => {
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

    if (localeReadLocals.has(init.callee.name ?? '')) {
      const id = node.id as { type?: string; name?: string }
      // `const` only: a reassignable binding would stop tracking the locale
      // the moment someone wrote to it, and an alias cannot follow that.
      if (id.type === 'Identifier' && parent?.kind === 'const') {
        localeReads.push({
          start: init.start as number,
          end: init.end as number,
          name: id.name ?? '',
        })
      }
      return
    }

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

  /**
   * Rewrites that turn a repeated locale read into an alias of the first one.
   *
   * `useI18n()` compiles into the very `useLocale()` a module may already be
   * calling itself, and `useLocale` is a `useContext` plus a
   * `useSyncExternalStore` - so two reads of one value mean two context reads
   * and two subscriptions. Within a function the first read in source order
   * keeps its call and every later one becomes `= <that variable>`.
   *
   * Source order decides rather than a preference between the two kinds: an
   * alias can only name a variable that is already declared.
   *
   * Only scopes that contain a `useI18n()` are touched. Two `useLocale()`
   * calls the module wrote itself are its own business; the compiler is here
   * to avoid adding a read, not to edit hooks nobody asked it about.
   */
  const localeAliases: Array<{ start: number; end: number; text: string }> = []

  /**
   * The module's own name for `useLocale`, when the compiled reads can use it
   * instead of a second import of the same function.
   *
   * Only when nothing in the module could mean anything else by that name:
   * every mention has to be the import specifier itself or the callee of a
   * call. A parameter, a variable or a property named `useLocale` all fail
   * the test, which is what keeps a shadowed name from being compiled
   * against - the reads are emitted inside the declaring component and at
   * module scope, and this makes both safe at once.
   */
  const reusableLocaleRead = ((): string | undefined => {
    if (localeReadLocals.size !== 1) return undefined
    const [name] = [...localeReadLocals]
    if (name === undefined) return undefined

    let safe = true
    walk(parsed.program, (node, parent) => {
      if (!safe) return
      if (node.type !== 'Identifier' || node.name !== name) return
      if (parent?.type === 'ImportSpecifier') return
      if (parent?.type === 'CallExpression' && parent.callee === node) return
      safe = false
    })

    return safe ? name : undefined
  })()

  const scopeOf = (offset: number): Scope | undefined =>
    innermost(offset, scopes)

  for (const scope of new Set(hookCalls.map((call) => scopeOf(call.start)))) {
    const reads = [
      ...hookCalls
        .filter((call) => scopeOf(call.start) === scope)
        .map((call) => ({ start: call.start, end: call.end, call })),
      ...localeReads
        .filter((read) => scopeOf(read.start) === scope)
        .map((read) => ({ ...read, call: undefined })),
    ].sort((a, b) => a.start - b.start)

    const [first, ...rest] = reads
    if (first === undefined || rest.length === 0) continue

    const name = first.call?.name ?? (first as LocaleRead).name
    for (const read of rest) {
      if (read.call !== undefined) read.call.alias = name
      else localeAliases.push({ start: read.start, end: read.end, text: name })
    }
  }

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

  // Parents of every node seen so far. `walk` visits a node before its
  // children, so by the time a <Trans> is reached its whole ancestor chain is
  // in here - which is what deciding the position below needs.
  const parentOf = new Map<unknown, Record<string, unknown> | undefined>()

  /**
   * Whether a React element is unambiguously valid where this `<Trans>` sits,
   * which is what decides whether it may become a component of its own.
   *
   * The immediate parent is not enough: `{cond && <Trans>...</Trans>}` among
   * children and `alt={cond ? <Trans>...</Trans> : ''}` have the same one. So
   * the chain is climbed through the nodes that merely pass a value along,
   * until something says where the value ends up.
   */
  const takesElement = (node: unknown): boolean => {
    let current = parentOf.get(node)

    while (current !== undefined) {
      switch (current.type) {
        // A children position (directly or behind braces), or the value of a
        // function, which renders it.
        case 'JSXElement':
        case 'JSXFragment':
        case 'ReturnStatement':
        case 'ArrowFunctionExpression':
          return true
        // Nodes that pass their operand along without deciding anything, so
        // the answer is whatever holds them.
        case 'JSXExpressionContainer':
        case 'ConditionalExpression':
        case 'LogicalExpression':
        case 'ParenthesizedExpression':
        case 'TSAsExpression':
        case 'TSNonNullExpression':
          current = parentOf.get(current)
          continue
        // An attribute may want a string (`alt`), a template literal always
        // does, and everything else is unknown - which counts as no.
        default:
          return false
      }
    }

    return false
  }

  walk(parsed.program, (node, parent) => {
    parentOf.set(node, parent)

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
          | { type?: string; value?: unknown }
          | null
          | undefined
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
      elementOk: takesElement(node),
    })
  })

  /**
   * Identifiers sitting in something shaped like a React dependency array,
   * collected only so the guard below can explain itself.
   *
   * They are not allowed through. A macro never leaves its call site - one
   * rule, no exceptions - and a dependency array is no exception even though
   * the compiled variable would happen to be a valid string there. What it
   * gets instead is an error naming the spelling that does work.
   *
   * Loose on purpose: any `use...()` call with an array argument counts,
   * since a wrong guess only ever changes the wording of a message.
   */
  const depNodes = new Set<unknown>()
  walk(parsed.program, (node) => {
    if (node.type !== 'CallExpression') return

    const callee = node.callee as
      | {
          type?: string
          name?: string
          computed?: boolean
          property?: { type?: string; name?: string }
        }
      | undefined

    // `useMemo(...)` or `React.useMemo(...)`.
    const hookName =
      callee?.type === 'Identifier'
        ? callee.name
        : callee?.type === 'MemberExpression' &&
            callee.computed !== true &&
            callee.property?.type === 'Identifier'
          ? callee.property.name
          : undefined

    if (hookName === undefined || !/^use[A-Z]/.test(hookName)) return

    for (const argument of (node.arguments ?? []) as Array<{
      type?: string
      elements?: Array<{ type?: string } | null>
    }>) {
      if (argument?.type !== 'ArrayExpression') continue
      for (const element of argument.elements ?? []) {
        if (element?.type === 'Identifier') depNodes.add(element)
      }
    }
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

    // A dependency array is the one rejection with a right answer to point
    // at, so it gets one. The stale-text warning is the important half: an
    // empty array compiles fine and then keeps the previous language.
    const hint =
      depNodes.has(node) &&
      hookScopeAt(node.start as number, name) !== undefined
        ? ' A dependency array wants the locale, not the macro: read it ' +
          'with `useLocale()` and depend on that variable, then silence ' +
          '`react-hooks/exhaustive-deps` for the line. Depending on nothing ' +
          'would leave the text in the previous language after a switch.'
        : ' It cannot be stored, passed, or shadowed.'

    throw new Error(
      `best-i18n: \`${name}\` is a compile-time macro and can only be ` +
        `used at its call site (${filename} offset ` +
        `${node.start as number}).${hint}\n\n  ${MACRO_MISUSE_DOCS}`,
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

  return {
    messages,
    hookCalls,
    localeAliases,
    reusableLocaleRead,
    macroImports,
    directiveEnd,
    directives,
  }
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

  const {
    messages,
    hookCalls,
    localeAliases,
    reusableLocaleRead,
    macroImports,
    directiveEnd,
    directives,
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
  // The module may already import the very function the compiled reads need.
  // Borrowing that name leaves one import where there would have been two -
  // and the second one would have gone unused in the process, since the call
  // it was written for gets aliased away.
  const localUseLocale = reusableLocaleRead ?? hygienic('__i18nUseLocale')
  const localN = hygienic('__i18nN')
  const localI = hygienic('__i18nI')

  const ruleFor = (locale: string) => options.plurals?.[locale] ?? GERMANIC

  const others = options.locales.filter(
    (locale) => locale !== options.baseLocale,
  )

  const isClientModule = directives.includes('use client')

  /**
   * What a shared function has to agree on, which is more than a catalog key:
   * the parameter list. A shared msgid implies a shared placeholder and element
   * set, so this is the same string for every call site in practice - it is
   * here so that a disagreement produces a second function rather than a call
   * with the wrong arity.
   */
  const signatureOf = (message: Message): string =>
    [
      catalogKey(message.context, message.text, message.plural?.other),
      message.placeholders.join(','),
      // `t` and `<Trans>` do not compile the same message the same way - a
      // lone expression stays an expression under `<Trans>` and stringifies
      // under `t` - so they never share a function, markup or no markup.
      message.elements === undefined
        ? 't'
        : `jsx:${message.elements.map((element) => element.token).join(',')}`,
    ].join('|')

  // How many call sites share a message. A message repeated within one module
  // hoists into a single module-level function - the translations are emitted
  // once, each call site pays one call. Only the multi-locale ternary form is
  // worth it: under `staticLocale` (and a single-locale config) the message is
  // already a bare literal.
  const repeats = new Map<string, number>()
  if (options.staticLocale === undefined && others.length > 0) {
    for (const message of messages) {
      const key = signatureOf(message)
      repeats.set(key, (repeats.get(key) ?? 0) + 1)
    }
  }
  const hoistPrefix = hygienic('__i18nM')
  const hoistedNames = new Map<string, string>()
  const hoistedDecls: string[] = []
  const componentPrefix = hygienic('__i18nT')
  const componentNames = new Map<string, string>()
  const componentDecls: string[] = []
  const elementPrefix = hygienic('__i18nC')
  const elementNames = new Map<string, string>()
  const elementDecls: string[] = []
  const localChild = hygienic('__i18nChild')
  const localProps = hygienic('__i18nProps')
  const clientUnbound: TransformResult['clientUnbound'] = []

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
      source.overwrite(call.start, call.end, `${localUseLocale}()`)
      needsReact = true
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

  // Compiles one message to its replacement expression. `localeExpr` is what
  // the ternary compares: the hook variable, a `getLocale()` call, or a
  // hoisted function's own locale parameter. `refs`, where given, names the
  // render prop standing in for each of a `<Trans>`'s elements, so the message
  // can be compiled away from the call site the elements came from.
  const compileMessage = (
    message: Message,
    localeExpr: string,
    refs?: string[],
  ): string => {
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
        refs,
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

  /** What a report says about a message: enough to find it again. */
  const pointAt = (message: Message) => ({
    text: message.text,
    line: message.line,
  })

  /** One parameter per expression, then one per element. */
  const paramsFor = (message: Message) => ({
    expressions: message.expressions.map((_, index) => `e${index}`),
    elements: (message.elements ?? []).map((_, index) => `c${index}`),
  })

  /**
   * The `(l, e0, ..., c0, ...) => <ternary>` every call site of a message can
   * share: the translations are emitted once and validated once, and each call
   * site pays a call.
   *
   * The inline form splices call-site source into the template - expressions
   * into the text, a `<a href={url}>`'s attributes into the markup - and that
   * cannot leave the scope it came from. Parameters are how it leaves:
   * expressions arrive as values, elements as render props.
   */
  const sharedFunction = (message: Message): string => {
    const key = signatureOf(message)
    const existing = hoistedNames.get(key)
    if (existing !== undefined) return existing

    const name = `${hoistPrefix}${hoistedNames.size + 1}`
    hoistedNames.set(key, name)

    const params = paramsFor(message)
    const lifted: Message = {
      ...message,
      expressions: params.expressions,
      plural:
        message.plural === undefined
          ? undefined
          : {
              ...message.plural,
              count:
                params.expressions[
                  message.expressions.indexOf(message.plural.count)
                ]!,
            },
    }
    hoistedDecls.push(
      `const ${name} = (${['l', ...params.expressions, ...params.elements].join(
        ', ',
      )}) => ${compileMessage(lifted, 'l', params.elements)}`,
    )

    return name
  }

  /**
   * A generated component for one message, so a client module can read the
   * locale through React without the file having called `useI18n()`.
   *
   * The hook has to sit at the top of a component's own render, and a message
   * among someone else's JSX is not that - so the message becomes the
   * component. Nothing about the markup is deferred to runtime: the body is
   * the same locale ternary as everywhere else, one level down.
   */
  const generatedComponent = (message: Message): string => {
    const key = signatureOf(message)
    const existing = componentNames.get(key)
    if (existing !== undefined) return existing

    const name = `${componentPrefix}${componentNames.size + 1}`
    componentNames.set(key, name)

    const params = paramsFor(message)
    const all = [...params.expressions, ...params.elements]
    const args = [
      `${localUseLocale}()`,
      ...all.map((p) => `${localProps}.${p}`),
    ]
    componentDecls.push(
      `const ${name} = (${all.length === 0 ? '' : localProps}) => ` +
        `${sharedFunction(message)}(${args.join(', ')})`,
    )
    needsReact = true

    return name
  }

  /**
   * The render prop for one element: `(child) => <a href={url}>{child}</a>`.
   *
   * An element whose source names nothing from the call site - a plain `<b>`,
   * an `<a href="/docs">` - is the same function for every render, so it is
   * hoisted to module scope and allocated once. The tag has to be intrinsic
   * for that: an uppercase one could be a component declared inside the
   * function we are hoisting out of.
   */
  const elementProp = (element: TransElement): string => {
    const source = element.selfClosing
      ? `() => ${element.open}`
      : `(${localChild}) => ${element.open}{${localChild}}${element.close}`

    if (element.open.includes('{') || !/^<[a-z]/.test(element.open)) {
      return source
    }

    const existing = elementNames.get(source)
    if (existing !== undefined) return existing

    const name = `${elementPrefix}${elementNames.size + 1}`
    elementNames.set(source, name)
    elementDecls.push(`const ${name} = ${source}`)

    return name
  }

  for (const message of messages) {
    const key = signatureOf(message)
    let replacement: string
    // A JSX element needs no braces among children - it is already an element
    // rather than a value to be interpolated.
    let isElement = false

    // Nothing to bind when the locale cannot vary: a per-locale build and a
    // single-locale config both compile to a bare literal.
    const unbound =
      message.localeVar === undefined &&
      options.staticLocale === undefined &&
      others.length > 0

    if (unbound && isClientModule && message.elementOk === true) {
      const params = paramsFor(message)
      const attributes = [
        ...params.expressions.map(
          (param, index) => `${param}={${message.expressions[index]}}`,
        ),
        ...params.elements.map(
          (param, index) =>
            `${param}={${elementProp(message.elements![index]!)}}`,
        ),
      ]
      const name = generatedComponent(message)
      replacement = `<${name}${attributes.map((a) => ` ${a}`).join('')} />`
      isElement = true
    } else if ((repeats.get(key) ?? 0) >= 2) {
      // Hook-bound call sites pass the variable that already holds the
      // locale; others read it at call time, so one function serves both.
      const args = [
        message.localeVar ?? `${localGetLocale}()`,
        ...message.expressions,
        ...(message.elements ?? []).map(elementProp),
      ]
      if (unbound) {
        needsRuntime = true
        if (isClientModule) clientUnbound.push(pointAt(message))
      }
      replacement = `${sharedFunction(message)}(${args.join(', ')})`
    } else {
      replacement = compileMessage(
        message,
        message.localeVar ?? `${localGetLocale}()`,
      )
      if (unbound) {
        needsRuntime = true
        if (isClientModule) clientUnbound.push(pointAt(message))
      }
    }

    source.overwrite(
      message.start,
      message.end,
      // Among JSX children the result has to be braced to stay an expression.
      message.braced === true && !isElement ? `{${replacement}}` : replacement,
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

  if (needsReact && reusableLocaleRead === undefined) {
    inject(
      `import { useLocale as ${localUseLocale} } from ${JSON.stringify(
        reactModule,
      )}`,
    )
  }

  for (const declaration of elementDecls) {
    inject(declaration)
  }

  for (const declaration of hoistedDecls) {
    inject(declaration)
  }

  for (const declaration of componentDecls) {
    inject(declaration)
  }

  return {
    code: source.toString(),
    map: source.generateMap({ hires: true, source: filename }),
    messages,
    missing,
    directives,
    clientUnbound,
  }
}
