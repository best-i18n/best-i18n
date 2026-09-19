/**
 * Compile-time macro for a Svelte message that contains markup.
 *
 * A tagged template cannot hold elements, so a sentence with a link or a bold
 * run in it has nowhere to go. `<Trans>` is that place: the markup is stored
 * as named placeholders — `Read the <a>docs</a>` — and a translation is free
 * to move them, without ever seeing an attribute.
 *
 * It compiles away like everything else here. Each locale's version is
 * reassembled into ordinary Svelte markup at build time (`{#if}` around the
 * branches, or the one locale under `staticLocale`), so no component walks a
 * message tree at runtime and nothing is looked up.
 *
 * Takes no props other than `ctx`. Wrap it in the element that needs a class,
 * an event, or anything else.
 *
 * @example
 *   import { Trans } from 'best-i18n/svelte/macro'
 *
 *   <p>
 *     <Trans>
 *       Read the <a href={docsUrl}>documentation</a> to learn more.
 *     </Trans>
 *   </p>
 */
export function Trans(props: {
  children?: unknown
  /** Disambiguation context (gettext `msgctxt`). Must be a string literal. */
  ctx?: string
}): never {
  void props
  throw new Error(
    'best-i18n: <Trans> reached runtime, which means this file was never ' +
      'transformed. Is the bundler plugin installed, and is svelte: true set?',
  )
}
