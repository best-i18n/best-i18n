import type { FunctionalComponent } from 'vue'

/**
 * Compile-time macro for a Vue message that contains markup.
 *
 * A tagged template cannot hold elements, so a sentence with a link or a bold
 * run in it has nowhere to go. `<Trans>` is that place: the markup is stored
 * as named placeholders — `Read the <a>docs</a>` — and a translation is free
 * to move them, without ever seeing an attribute.
 *
 * It compiles away like everything else here. Each locale's version is
 * reassembled into ordinary template markup at build time (`<template v-if>`
 * around the branches, or the one locale under `staticLocale`), so no
 * component walks a message tree at runtime and nothing is looked up.
 *
 * Takes no props other than `ctx`. Wrap it in the element that needs a class,
 * an event, or anything else.
 *
 * @example
 *   <script setup lang="ts">
 *     import { Trans } from 'best-i18n/vue/macro'
 *     defineProps<{ docsUrl: string }>()
 *   </script>
 *
 *   <template>
 *     <p>
 *       <Trans>
 *         Read the <a :href="docsUrl">documentation</a> to learn more.
 *       </Trans>
 *     </p>
 *   </template>
 */
export const Trans: FunctionalComponent<{ ctx?: string }> = () => {
  throw new Error(
    'best-i18n: <Trans> reached runtime, which means this file was never ' +
      'transformed. Is the bundler plugin installed, and is vue: true set?',
  )
}
Trans.props = ['ctx']
