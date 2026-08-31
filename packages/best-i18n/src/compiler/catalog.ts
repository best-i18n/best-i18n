import { readFileSync } from 'node:fs'
import path from 'node:path'

import { parsePo } from './po.ts'

import type { TransformOptions } from './transform.ts'

export interface CatalogOptions {
  /** Directory holding `messages.pot` and `<locale>.po`. */
  messagesDir: string
  locales: string[]
  baseLocale: string
}

export interface LoadedCatalog {
  catalog: TransformOptions['catalog']
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
  const catalog: Record<string, Record<string, string>> = {}
  const files: string[] = []

  const templateFile = path.join(messagesDir, 'messages.pot')
  files.push(templateFile)

  const template = parsePo(readFileSync(templateFile, 'utf8'), baseLocale)

  // Indexed by source text so the transform never has to derive an id.
  const sourceOf = new Map<string, string>()

  for (const entry of template.entries) {
    if (entry.obsolete) continue
    sourceOf.set(entry.id, entry.source)
    catalog[entry.source] ??= {}
    catalog[entry.source][baseLocale] = entry.source
  }

  for (const locale of locales) {
    if (locale === baseLocale) continue

    const file = path.join(messagesDir, `${locale}.po`)
    files.push(file)

    const po = parsePo(readFileSync(file, 'utf8'), locale)

    for (const entry of po.entries) {
      // A fuzzy translation was written for a different wording - the merge
      // flagged it for review, so shipping it verbatim would be wrong in a way
      // nobody would see. Standard gettext behaviour: fuzzy does not build.
      // The message then falls back to the base locale and is reported as
      // missing by the transform, which is the visible version of the truth.
      if (entry.obsolete || entry.fuzzy || entry.target === '') continue
      const source = sourceOf.get(entry.id)
      if (source === undefined) continue
      catalog[source]![locale] = entry.target
    }
  }

  return { catalog, files }
}
