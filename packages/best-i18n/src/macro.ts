/**
 * Compile-time macros for translatable messages.
 *
 * This module lives under a `/macro` subpath on purpose: every call is
 * rewritten at build time, so it is not a normal runtime import. In particular
 * the bindings cannot be stored, passed, or called dynamically - the text has
 * to be statically visible. Doing so is a build error, not a runtime surprise.
 */

/** The tagged-template shape shared by `t` and `t.ctx(...)`. */
export type TranslateTag = (
  strings: TemplateStringsArray,
  ...values: Array<string | number>
) => string

export interface TranslateMacro extends TranslateTag {
  /**
   * Disambiguation context (gettext `msgctxt`): two messages with the same
   * text but different contexts are separate entries, translated separately.
   *
   * @example
   *   t.ctx('verb')`Open`     // "Open the file"
   *   t.ctx('adjective')`Open` // "The shop is open"
   */
  ctx: (context: string) => TranslateTag
}

function unreachable(): never {
  throw new Error(
    'best-i18n: a macro reached runtime, which means this file was never ' +
      'transformed. Is the bundler plugin installed?',
  )
}

/**
 * Compile-time macro for a translatable message.
 *
 * @example
 *   import { t } from 'best-i18n/macro'
 *
 *   <h1>{t`A small starter with room to grow.`}</h1>
 *   <p>{t`Hello ${name}, you have ${count} items`}</p>
 */
export const t: TranslateMacro = Object.assign(
  (strings: TemplateStringsArray, ...values: Array<string | number>) => {
    void values
    throw new Error(
      `best-i18n: the macro t\`${strings.join('${...}')}\` reached runtime, ` +
        'which means this file was never transformed. Is the bundler plugin installed?',
    )
  },
  { ctx: (): TranslateTag => unreachable() },
)

/**
 * Compile-time macro for a gettext plural pair.
 *
 * The two forms are the `msgid`/`msgid_plural` of one catalog entry; each
 * locale's `.po` file supplies as many `msgstr[n]` forms as its
 * `Plural-Forms` header declares, and the compiler inlines that locale's
 * selection formula at the call site - no ICU runtime, no `Intl.PluralRules`.
 *
 * The count expression is always available to translations as a placeholder
 * ({n} below), whether or not the source forms interpolate it.
 *
 * @example
 *   import { plural } from 'best-i18n/macro'
 *
 *   plural(n, `One item`, `${n} items`)
 */
export function plural(count: number, one: string, other: string): string {
  void count
  void one
  void other
  return unreachable()
}
