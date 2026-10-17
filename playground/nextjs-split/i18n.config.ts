import type { I18nConfig } from 'best-i18n/config'

/**
 * Build-time i18n config, read by `i18n-extract` and the Next plugin; the
 * runtime config in `src/i18n.ts` takes its locales from here too.
 *
 * `split` is what this playground is about: the catalog is sharded by source
 * directory, two levels below `src`, instead of one `.po` per locale. See the
 * README for the tree it produces.
 */
export default {
  locales: ['en', 'zh'],
  baseLocale: 'en',
  split: { depth: 2 },
} satisfies I18nConfig
