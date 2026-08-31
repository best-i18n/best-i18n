import { readFileSync } from 'node:fs'
import path from 'node:path'

import { pluralRuleFor } from './plural.ts'
import { parsePo } from './po.ts'
import { catalogKey } from './transform.ts'

import type { PluralRule } from './plural.ts'
import type { TransformOptions } from './transform.ts'

export interface CatalogOptions {
  /** Directory holding `messages.pot` and `<locale>.po`. */
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

  const templateFile = path.join(messagesDir, 'messages.pot')
  files.push(templateFile)

  const template = parsePo(readFileSync(templateFile, 'utf8'), baseLocale)
  plurals[baseLocale] = pluralRuleFor(
    baseLocale,
    template.headers?.['Plural-Forms'],
  )

  // The set of keys the source actually contains, so a stale entry in a
  // locale file cannot invent a message.
  const known = new Set<string>()

  for (const entry of template.entries) {
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

    const file = path.join(messagesDir, `${locale}.po`)
    files.push(file)

    const po = parsePo(readFileSync(file, 'utf8'), locale)
    const rule = pluralRuleFor(locale, po.headers?.['Plural-Forms'])
    plurals[locale] = rule

    for (const entry of po.entries) {
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
