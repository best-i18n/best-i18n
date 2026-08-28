/**
 * Compile-time macro for a translatable message.
 *
 * This module lives under a `/macro` subpath on purpose: every `t` call is
 * rewritten at build time, so it is not a normal runtime import. In particular
 * the binding cannot be stored, passed, or called dynamically - the text has to
 * be statically visible. Doing so is a build error, not a runtime surprise.
 *
 * @example
 *   import { t } from 'best-i18n/macro'
 *
 *   <h1>{t`A small starter with room to grow.`}</h1>
 *   <p>{t`Hello ${name}, you have ${count} items`}</p>
 */
export function t(
  strings: TemplateStringsArray,
  ...values: Array<string | number>
): string {
  throw new Error(
    `best-i18n: the macro t\`${strings.join('${...}')}\` reached runtime, ` +
      'which means this file was never transformed. Is the bundler plugin installed?',
  )
  // Part of the public signature even though the body throws.
  void values
}
