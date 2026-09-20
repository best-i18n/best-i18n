// oxlint-disable typescript/method-signature-style -- method signatures are
// bivariant, which is what lets an adapter narrow ParsedFile to its own shape
// for parse() and finalize() and still sit in a FrameworkAdapter[] list.
import type { MagicString } from 'magic-string'
import type { StaticImport } from './bindings.ts'
import type { Message, TransformOptions } from './message.ts'
import type { TransElement } from './trans.ts'

/**
 * One script's worth of parsed source: the shape `oxc-parser` returns, and
 * the shape a framework adapter has to produce for anything that is not a
 * plain module - a Svelte component's instance script plus its template, say.
 */
export interface ParsedSource {
  program: unknown
  module: { staticImports: StaticImport[] }
  comments: Array<{ value: string; end: number }>
  errors: Array<{ message: string }>
}

/** A whole file, parsed: the contexts to analyze and where imports may go. */
export interface ParsedFile {
  /** A JSX module is one context; a Svelte component is up to two. */
  contexts: ParsedSource[]
  /**
   * Where injected statements land: after the directive prologue in a module,
   * at the top of a script in a component. `0` means prepend.
   */
  directiveEnd: number
  /** The module's directive prologue - `'use client'` and friends. */
  directives: string[]
}

/** The macro names and modules the analysis is configured with. */
export interface MacroNames {
  tag: string
  from: string[]
  plural: string
  hook: string
  hookFrom: string[]
  component: string
  componentFrom: string[]
}

/** What an adapter reads off a `<Trans>` node. The core fills in the rest. */
export interface TransMatch {
  text: string
  expressions: string[]
  placeholders: string[]
  elements: TransElement[]
  context: string
  start: number
  end: number
  /** See `Message.braced`. */
  braced: boolean
  /** See `Message.elementOk`. */
  elementOk: boolean
  /** See `Message.attribute`. */
  attribute?: boolean
  /** See `Message.svelte`. */
  svelte?: boolean
}

/** What the core hands an adapter alongside a candidate `<Trans>` node. */
export interface TransContext {
  code: string
  filename: string
  /** The component macro's configured name, for error messages. */
  component: string
  /** Local bindings that refer to the component macro. */
  componentLocals: Set<string>
  /** Parent of every node visited so far. */
  parentOf: Map<unknown, Record<string, unknown> | undefined>
  /** Whether a React element is valid where `node` sits. */
  takesElement: (node: unknown) => boolean
}

/**
 * Everything about compiling messages that depends on the framework.
 *
 * The core knows macros, catalogs, plurals and how to splice a replacement
 * into a file. An adapter knows how its framework's files parse, what a
 * `<Trans>` looks like there, how markup is rebuilt per locale, and which
 * runtime module reads the locale reactively. Adding a framework is adding
 * one of these; nothing in the core lists them by name.
 */
export interface FrameworkAdapter<P extends ParsedFile = ParsedFile> {
  readonly name: string
  /** The module the compiled locale read is imported from. */
  readonly runtimeModule: string
  /** The module the `<Trans>` macro is imported from, for `componentFrom`. */
  readonly componentModule: string
  /** Whether `'use client'` splits a render across two module graphs here. */
  readonly clientDirectives: boolean
  /**
   * Whether a rebuilt `<Trans>` is wrapped in `<>...</>` so it is one JSX
   * expression. A template language has no such need.
   */
  readonly transFragment: boolean
  parse(code: string, filename: string): P
  /**
   * Reject imports that cannot mean anything here - another framework's
   * hook, say. Runs for extraction too, so it must not depend on options
   * only the transform has.
   */
  checkImports?(
    imports: StaticImport[],
    names: MacroNames,
    filename: string,
  ): void
  /** Reject a transform configuration the file cannot be compiled under. */
  checkTransform?(
    requests: string[],
    options: TransformOptions,
    filename: string,
  ): void
  /** Recognize a `<Trans>` node and read its message; `undefined` for any other node. */
  matchTrans(
    node: Record<string, unknown>,
    parent: Record<string, unknown> | undefined,
    context: TransContext,
  ): TransMatch | undefined
  /** Whether a repeated message may compile into one shared function. */
  hoistable(message: Message): boolean
  /**
   * The multi-locale form of a message with markup, when it is not the JS
   * ternary the core would write. `branches` are the non-base locales, in
   * order; `base` is the fallback.
   */
  renderMarkupBranches?(
    message: Message,
    base: string,
    branches: Array<{ locale: string; rendered: string }>,
    localeExpr: string,
  ): string
  /** The last word on a replacement before it is written into the file. */
  wrapReplacement?(
    message: Message,
    replacement: string,
    options: { staticLocale: boolean },
  ): string
  /** After every edit: a chance to tidy what the edits left behind. */
  finalize?(
    source: MagicString,
    code: string,
    parsed: P,
    injected: boolean,
  ): void
}
