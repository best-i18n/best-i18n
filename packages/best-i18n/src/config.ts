/**
 * The project's i18n config, written once in `i18n.config.ts` and read by
 * `i18n-extract`, `i18n-compile` and every bundler plugin. Without it each of
 * those takes the same facts as its own options - and a `hookFrom` the plugin
 * knows and the extractor does not is a message that builds but is never
 * extracted, with nothing to say so.
 *
 * Build-time facts only. What the running app needs - cookie, proxy,
 * `exclude` - stays in `defineI18nConfig`, which ships to the client; this
 * file never does.
 *
 * Paths are relative to the config file. An option passed explicitly - a CLI
 * flag, a plugin option - wins over the file.
 */
export interface I18nConfig {
  /** Every locale. */
  locales: string[]
  /**
   * The locale the source is written in, and the fallback for a missing
   * translation.
   *
   * @default the first of `locales`
   */
  baseLocale?: string
  /**
   * Directory holding `messages.pot` and `<locale>.po`.
   *
   * @default 'messages'
   */
  messagesDir?: string
  /**
   * Source roots `i18n-extract` scans.
   *
   * @default ['src']
   */
  src?: string[]
  /** Shard the catalog by source directory - see `i18n-extract --split-depth`. */
  split?: {
    /** How many directory levels below `root` a shard path keeps. */
    depth: number
    /**
     * Directory shard paths are relative to.
     *
     * @default the one `src` root, or the config file's directory
     */
    root?: string
  }
  /** Name of the tagged template to treat as a message. */
  tag?: string
  /** Name of the plural macro export. */
  plural?: string
  /** Name of the hook-shaped macro export. */
  hook?: string
  /** Name of the component-shaped macro export. */
  component?: string
  /** Modules whose `tag` export is the macro - list yours if you re-export it. */
  from?: string[]
  /** Modules whose `hook` export is the hook macro. */
  hookFrom?: string[]
  /** Modules whose `component` export is the `<Trans>` macro. */
  componentFrom?: string[]
}

/**
 * Identity function that pins the config's type where it is written.
 *
 * @example
 *   // i18n.config.ts
 *   import { defineConfig } from 'best-i18n/config'
 *
 *   export default defineConfig({
 *     locales: ['en', 'zh'],
 *     hookFrom: ['~/i18n'],
 *     split: { depth: 2 },
 *   })
 */
export function defineConfig(config: I18nConfig): I18nConfig {
  return config
}
