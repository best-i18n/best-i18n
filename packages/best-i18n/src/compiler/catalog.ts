import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pluralRuleFor } from './plural.ts'
import { parsePo } from './po.ts'
import { findShards, shardDir } from './shards.ts'
import { catalogKey } from './transform.ts'
import type { PluralRule } from './plural.ts'
import type { PoFile } from './po.ts'
import type { TransformOptions } from './transform.ts'

export interface CatalogOptions {
  /**
   * Directory holding `messages.pot` and `<locale>.po`, and any shards
   * `i18n-extract --split-depth` wrote below it.
   */
  messagesDir: string
  locales: string[]
  baseLocale: string
}

export interface LoadedCatalog {
  catalog: TransformOptions['catalog']
  /** Per-locale plural rule: the catalog's `Plural-Forms`, or the builtin. */
  plurals: Record<string, PluralRule>
  /**
   * Every file the catalog was built from, so each bundler can register them
   * as dependencies and reload when a translator edits one.
   */
  files: string[]
}

/**
 * Reads the PO catalogs. The `.po` files are the source of truth, so no compile
 * step has to run before dev or build; `i18n-compile` only exists for consumers
 * that want JSON or JS.
 */
export function loadCatalog(options: CatalogOptions): LoadedCatalog {
  const { messagesDir, locales, baseLocale } = options
  const catalog: Record<string, Record<string, string | string[]>> = {}
  const plurals: Record<string, PluralRule> = {}
  const files: string[] = []

  // A catalog split by `i18n-extract --split-depth` is several directories
  // laid out like this one; an unsplit one is the root alone. Reading the
  // root even when nothing was found keeps the error for a missing catalog
  // pointing at the file people expect.
  const found = findShards(messagesDir)
  const shards = found.length > 0 ? found : ['']
  const read = (file: string, locale: string) => {
    files.push(file)
    return parsePo(readFileSync(file, 'utf8'), locale)
  }
  // Shards are one catalog: the first one that states `Plural-Forms` speaks
  // for the locale, the root before any other.
  const ruleOf = (locale: string, headers: Array<PoFile['headers']>) =>
    pluralRuleFor(
      locale,
      headers.find((header) => header?.['Plural-Forms'] !== undefined)?.[
        'Plural-Forms'
      ],
    )

  const templates = shards.map((shard) =>
    read(path.join(shardDir(messagesDir, shard), 'messages.pot'), baseLocale),
  )
  plurals[baseLocale] = ruleOf(
    baseLocale,
    templates.map((template) => template.headers),
  )

  // The set of keys the source actually contains, so a stale entry in a
  // locale file cannot invent a message.
  const known = new Set<string>()

  for (const entry of templates.flatMap((template) => template.entries)) {
    if (entry.obsolete) continue
    const key = catalogKey(entry.context, entry.source, entry.pluralSource)
    known.add(key)
    catalog[key] ??= {}
    catalog[key][baseLocale] =
      entry.pluralSource === undefined
        ? entry.source
        : [entry.source, entry.pluralSource]
  }

  for (const locale of locales) {
    if (locale === baseLocale) continue

    const po = shards.map((shard) =>
      read(path.join(shardDir(messagesDir, shard), `${locale}.po`), locale),
    )
    const rule = ruleOf(
      locale,
      po.map((file) => file.headers),
    )
    plurals[locale] = rule

    for (const entry of po.flatMap((file) => file.entries)) {
      // A fuzzy translation was written for a different wording - the merge
      // flagged it for review, so shipping it verbatim would be wrong in a
      // way nobody would see. Standard gettext behaviour: fuzzy does not
      // build. The message then falls back to the base locale and is
      // reported as missing by the transform, the visible version of the
      // truth.
      if (entry.obsolete || entry.fuzzy || entry.target === '') continue

      const key = catalogKey(entry.context, entry.source, entry.pluralSource)
      if (!known.has(key)) continue

      if (entry.pluralSource === undefined) {
        catalog[key]![locale] = entry.target
        continue
      }

      // A plural entry ships only when every form the locale's rule demands
      // is present and non-empty; anything less falls back like a missing
      // translation instead of throwing `undefined` at a user.
      const forms = [entry.target, ...(entry.pluralTargets ?? [])]
      if (forms.length !== rule.nplurals) continue
      if (forms.includes('')) continue
      catalog[key]![locale] = forms
    }
  }

  return { catalog, plurals, files }
}
