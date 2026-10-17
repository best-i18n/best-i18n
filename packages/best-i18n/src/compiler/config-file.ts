import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import type { I18nConfig } from '../config.ts'

/** Looked for in this order, in the working directory. */
export const CONFIG_FILES = [
  'i18n.config.ts',
  'i18n.config.mts',
  'i18n.config.js',
  'i18n.config.mjs',
]

/** The config file with its defaults applied and its paths made absolute. */
export interface ResolvedConfig extends Omit<
  I18nConfig,
  'baseLocale' | 'messagesDir' | 'src' | 'split'
> {
  baseLocale: string
  messagesDir: string
  src: string[]
  split: { depth: number; root: string } | undefined
}

export interface LoadedConfig {
  file: string
  config: ResolvedConfig
}

const require = createRequire(import.meta.url)
const cache = new Map<string, LoadedConfig>()

/**
 * Loads `i18n.config.*` from `cwd`, or the named `file`. `undefined` when
 * there is none, so every caller can keep working from its own options.
 *
 * Synchronous on purpose: the plugin factories are synchronous, and Node
 * `require()`s an ES module - and, with its built-in type stripping, a `.ts`
 * one - without making them otherwise. The cost is that a `.ts` config needs
 * a Node that strips types (22.18+, 23.6+) and only erasable syntax in it;
 * `i18n.config.mjs` works everywhere.
 */
export function loadConfigFile(
  options: { cwd?: string; file?: string } = {},
): LoadedConfig | undefined {
  const cwd = options.cwd ?? process.cwd()
  const file =
    options.file === undefined
      ? CONFIG_FILES.map((name) => path.join(cwd, name)).find((candidate) =>
          existsSync(candidate),
        )
      : path.resolve(cwd, options.file)

  if (file === undefined) return undefined

  const cached = cache.get(file)
  if (cached !== undefined) return cached

  let loaded: unknown
  try {
    loaded = require(file)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ERR_UNKNOWN_FILE_EXTENSION') {
      throw new Error(
        `best-i18n: ${file} needs a Node.js that runs TypeScript (22.18+ or ` +
          `23.6+) - or rename it to i18n.config.mjs.`,
        { cause: error },
      )
    }
    if (code === 'MODULE_NOT_FOUND' && options.file !== undefined) {
      throw new Error(`best-i18n: config file ${file} does not exist`, {
        cause: error,
      })
    }
    throw error
  }

  const config = (loaded as { default?: unknown }).default ?? loaded
  const result = { file, config: resolveConfig(file, config) }
  cache.set(file, result)
  return result
}

function resolveConfig(file: string, value: unknown): ResolvedConfig {
  const fail = (message: string): never => {
    throw new Error(`best-i18n: ${file}: ${message}`)
  }

  if (typeof value !== 'object' || value === null) {
    fail('the default export must be the config object')
  }
  const config = value as I18nConfig
  if (
    !Array.isArray(config.locales) ||
    config.locales.length === 0 ||
    !config.locales.every((locale) => typeof locale === 'string')
  ) {
    fail('`locales` must list every locale, e.g. ["en", "zh"]')
  }
  const baseLocale = config.baseLocale ?? config.locales[0]!
  if (!config.locales.includes(baseLocale)) {
    fail(`\`baseLocale\` "${baseLocale}" is not one of \`locales\``)
  }

  const dir = path.dirname(file)
  const src = (config.src ?? ['src']).map((root) => path.resolve(dir, root))

  let split: ResolvedConfig['split']
  if (config.split !== undefined) {
    const { depth } = config.split
    if (!Number.isInteger(depth) || depth < 1) {
      fail('`split.depth` must be a whole number of levels, 1 or more')
    }
    split = {
      depth,
      root:
        config.split.root === undefined
          ? src.length === 1
            ? src[0]!
            : dir
          : path.resolve(dir, config.split.root),
    }
  }

  return {
    ...config,
    baseLocale,
    messagesDir: path.resolve(dir, config.messagesDir ?? 'messages'),
    src,
    split,
  }
}

/** The options a bundler plugin takes that the config file can supply. */
const SHARED = [
  'locales',
  'baseLocale',
  'messagesDir',
  'tag',
  'plural',
  'hook',
  'component',
  'from',
  'hookFrom',
  'componentFrom',
] as const

type Shared = Pick<ResolvedConfig, (typeof SHARED)[number]>

/**
 * A plugin's options with the config file filling in what was not passed.
 * Explicit options win key by key; `locales` has to come from one or the
 * other, `baseLocale` defaults to the first locale and `messagesDir` to
 * `messages`, as everywhere else.
 */
export function withConfigFile<
  T extends { locales?: string[]; baseLocale?: string; messagesDir?: string },
>(
  name: string,
  options: T,
): T & { locales: string[]; baseLocale: string; messagesDir: string } {
  const loaded = loadConfigFile()
  const merged: Record<string, unknown> = { ...options }

  if (loaded !== undefined) {
    for (const key of SHARED) {
      const value = (loaded.config as Shared)[key]
      if (merged[key] === undefined && value !== undefined) merged[key] = value
    }
  }

  const locales = merged.locales as string[] | undefined
  if (locales === undefined || locales.length === 0) {
    throw new Error(
      `${name}: no locales - pass \`locales\`, or write them in an ` +
        `i18n.config.ts next to where the build runs.`,
    )
  }

  return {
    ...(merged as T),
    locales,
    baseLocale: (merged.baseLocale as string | undefined) ?? locales[0]!,
    messagesDir: (merged.messagesDir as string | undefined) ?? 'messages',
  }
}
