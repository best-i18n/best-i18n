#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parsePo } from '../compiler/po.ts'
import { fail as failCli, parseCli } from './args.ts'

const NAME = 'i18n-compile'

/** The command line, as cac hands it over. */
interface Options {
  locales?: string
  base?: string
  messages: string
  outdir?: string
  format: string
  skipFuzzy?: boolean
}

/** The command line, validated and with defaults applied. */
interface Config {
  locales: string[]
  base: string
  messagesDir: string
  outdir: string
  format: 'json' | 'js'
  skipFuzzy: boolean
}

/** One locale's compiled catalog: key to translation, plurals as arrays. */
type Catalog = Record<string, string | string[]>

const out = (line: string) => process.stdout.write(`${line}\n`)
const fail: (message: string) => never = (message) => failCli(NAME, message)

function main(): number {
  const config = configure()
  const sources = readTemplate(config)
  writeCatalog(config, config.base, sources)
  for (const locale of config.locales.filter((item) => item !== config.base)) {
    writeCatalog(config, locale, compileLocale(config, locale, sources))
  }
  return 0
}

// ------------------------------------------------------------- configure

function configure(): Config {
  const options = parseCli<Options>(
    NAME,
    'turn the PO catalogs into what the build consumes',
    `  Reads messages/messages.pot (source texts) and messages/<locale>.po, and
  writes one catalog per locale. The output is a build artifact: edit the .po.`,
    (command) =>
      command
        .option(
          '--locales <list>',
          'comma separated, first one is the base locale',
        )
        .option('--base <locale>', 'override the base locale')
        .option('--messages <dir>', 'catalog directory', {
          default: 'messages',
        })
        .option(
          '--outdir <dir>',
          'output directory (default: same as --messages)',
        )
        .option('--format <fmt>', 'json | js', { default: 'json' })
        .option(
          '--skip-fuzzy',
          'leave fuzzy translations out, falling back to the source',
        ),
  )

  const locales = options.locales?.split(',').filter(Boolean) ?? []
  if (locales.length === 0) fail('--locales is required')
  const { format } = options
  if (format !== 'json' && format !== 'js') fail(`unknown --format ${format}`)

  return {
    locales,
    base: options.base ?? locales[0]!,
    messagesDir: options.messages,
    outdir: options.outdir ?? options.messages,
    format,
    skipFuzzy: options.skipFuzzy === true,
  }
}

// ------------------------------------------------------------------ read

function readPo(file: string, locale: string) {
  try {
    return parsePo(readFileSync(file, 'utf8'), locale)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      fail(`${file} is missing - run i18n-extract first`)
    }
    throw error
  }
}

// Keyed the way gettext identifies entries: the source text, prefixed by
// the context when there is one. Plural entries map to their msgstr array.
const keyOf = (entry: { context: string; source: string }) =>
  entry.context === '' ? entry.source : `${entry.context}\u0004${entry.source}`

/** The base locale's catalog: every source text, keyed like the build does. */
function readTemplate(config: Config): Catalog {
  const template = readPo(
    path.join(config.messagesDir, 'messages.pot'),
    config.base,
  )
  const sources: Catalog = {}
  for (const entry of template.entries) {
    if (entry.obsolete) continue
    sources[keyOf(entry)] =
      entry.pluralSource === undefined
        ? entry.source
        : [entry.source, entry.pluralSource]
  }
  return sources
}

/**
 * One locale's translations, restricted to messages the template still has
 * and to entries that are actually translated.
 */
function compileLocale(
  config: Config,
  locale: string,
  sources: Catalog,
): Catalog {
  const po = readPo(path.join(config.messagesDir, `${locale}.po`), locale)
  const catalog: Catalog = {}
  let fuzzySkipped = 0

  for (const entry of po.entries) {
    if (entry.obsolete) continue
    if (!(keyOf(entry) in sources)) continue
    if (entry.target === '') continue
    if (entry.fuzzy && config.skipFuzzy) {
      fuzzySkipped++
      continue
    }
    catalog[keyOf(entry)] =
      entry.pluralSource === undefined
        ? entry.target
        : [entry.target, ...(entry.pluralTargets ?? [])]
  }

  if (fuzzySkipped > 0) out(`    ${fuzzySkipped} fuzzy entr(ies) skipped`)
  return catalog
}

// ----------------------------------------------------------------- write

function writeCatalog(config: Config, locale: string, catalog: Catalog): void {
  mkdirSync(config.outdir, { recursive: true })
  const sorted = Object.fromEntries(
    Object.keys(catalog)
      .sort()
      .map((key) => [key, catalog[key]!]),
  )

  const file = path.join(config.outdir, `${locale}.${config.format}`)
  const body =
    config.format === 'js'
      ? `// Generated by i18n-compile. Edit the .po file instead.\nexport default ${JSON.stringify(sorted, null, 2)}\n`
      : `${JSON.stringify(sorted, null, 2)}\n`

  writeFileSync(file, body)
  out(`  ${file}  (${Object.keys(sorted).length} message(s))`)
}

process.exitCode = main()
