/**
 * Hook-shaped compile-time macro, modelled on Lingui's `useLingui()`.
 *
 * It returns the tag itself rather than an object, so the call has to be
 * `const t = useI18n()` - `const { t } = useI18n()` is a build error, because
 * a destructured binding cannot be traced back to its tagged templates.
 *
 * `const t = useI18n()` compiles into `const t = useLocale()`, and every
 * `t\`...\`` in that scope compiles into a ternary on that variable - so the
 * strings stay inlined (nothing is looked up at runtime), while the component
 * re-renders on locale change like any hook consumer. In a per-locale build
 * both collapse away entirely.
 *
 * @example
 *   import { useI18n } from 'best-i18n/react/macro'
 *
 *   function About() {
 *     const t = useI18n()
 *     return <h1>{t`A small starter with room to grow.`}</h1>
 *   }
 */
export function useI18n(): (
  strings: TemplateStringsArray,
  ...values: Array<string | number>
) => string {
  throw new Error(
    'best-i18n: useI18n() reached runtime, which means this file was never ' +
      'transformed. Is the bundler plugin installed?',
  )
}

/**
 * Compile-time macro for a message that contains markup.
 *
 * A tagged template cannot hold JSX, so a message with a link or a bold run in
 * it has nowhere to go. `<Trans>` is that place: the markup is stored as
 * numbered placeholders - `Read the <0>docs</0>` - and a translation is free to
 * move them, without ever seeing a JSX attribute.
 *
 * It compiles away like everything else here. Each locale's version is
 * reassembled into ordinary JSX at build time, so no component walks a message
 * tree at runtime and nothing is looked up.
 *
 * Takes no props. `key` included: wrap it in the element that needs one.
 *
 * @example
 *   import { Trans } from 'best-i18n/react/macro'
 *
 *   <p>
 *     <Trans>
 *       Read the <a href={docsUrl}>documentation</a> to learn more.
 *     </Trans>
 *   </p>
 */
export function Trans(props: { children?: unknown }): never {
  throw new Error(
    'best-i18n: <Trans> reached runtime, which means this file was never ' +
      'transformed. Is the bundler plugin installed?',
  )
  // Part of the public signature even though the body throws.
  void props
}
