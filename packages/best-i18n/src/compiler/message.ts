import {
  DEFAULT_COMPONENT_FROM,
  DEFAULT_FROM,
  DEFAULT_HOOK_FROM,
} from './frameworks.ts'
import type { MagicString } from 'magic-string'
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
  /**
   * Set for a Svelte `<Trans>`: the replacement is template markup (`{#if}`
   * around locale branches, or the children on their own) rather than a JSX
   * expression. Svelte cannot put elements inside `{...}`.
   */
  svelte?: boolean
  /**
   * Set for a JSX `<Trans>` that is a prop value - `alt={<Trans>...</Trans>}`.
   * Solid reads attribute expressions inside an effect already, so the
   * replacement must stay a plain expression there rather than a fragment.
   */
  attribute?: boolean
  /**
   * Set for a Vue `<Trans>`: the replacement is template markup - `{{ }}`
   * around a text-only message, `<template v-if>` blocks around markup -
   * rather than a JSX expression.
   */
  vue?: boolean
  /**
   * Set when the call site names its own locale - `t.locale(lang)`,
   * `<Trans locale="zh">` - instead of reading the current one. `source` is
   * the expression as written; `literal` is its value when it is a string
   * literal, which compiles to that locale's text and nothing else.
   */
  explicitLocale?: ExplicitLocale
}

export interface ExplicitLocale {
  source: string
  literal?: string
}

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
  /** Compile Solid JSX and use best-i18n/solid for reactive locale reads. */
  solid?: boolean
  /**
   * Read the locale through best-i18n/vue in every file, not only in `.vue`
   * components, so a composable's `computed(() => t\`...\`)` tracks it.
   */
  vue?: boolean
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
   * @default ['best-i18n/react/macro', 'best-i18n/svelte/macro', 'best-i18n/solid/macro']
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
  /** The file is Solid JSX: React's `useI18n()` is rejected up front. */
  solid?: boolean
  /** The project is Vue: `.ts` files read the locale through best-i18n/vue. */
  vue?: boolean
}
