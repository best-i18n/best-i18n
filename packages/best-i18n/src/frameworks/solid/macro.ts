import type { JSX } from 'solid-js'

/**
 * Compile-time rich-text message for Solid JSX. Requires `solid: true` in
 * best-i18n/vite (or best-i18n/rolldown). The component is compiled away.
 *
 * @example
 *   import { Trans } from 'best-i18n/solid/macro'
 *   export default function About() {
 *     return <p><Trans>Read the <a href="/docs">docs</a>.</Trans></p>
 *   }
 */
export function Trans(props: {
  children?: JSX.Element
  /** Disambiguation context (gettext msgctxt). Must be a string literal. */
  ctx?: string
  /** Render in this locale instead of the current one; see `t.locale`. */
  locale?: string
}): JSX.Element {
  void props
  throw new Error(
    'best-i18n: <Trans> reached runtime. Enable solid: true in the best-i18n bundler plugin.',
  )
}
