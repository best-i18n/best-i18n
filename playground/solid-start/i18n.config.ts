import type { I18nConfig } from 'best-i18n/config'

/**
 * Build-time i18n config, read by `i18n-extract` and the bundler plugin. The
 * runtime config takes its locales from here too, so they are written once.
 *
 * `satisfies` rather than `defineConfig()`: the runtime config imports this
 * file, and a type-only import leaves nothing of best-i18n/config in the
 * client bundle.
 */
export default {
  locales: ['en', 'zh'],
  baseLocale: 'en',
} satisfies I18nConfig
