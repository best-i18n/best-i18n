#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { mergeMessages } from '../compiler/merge.ts'
import { formatPo, parsePo, samePo } from '../compiler/po.ts'
import { extract } from '../compiler/transform.ts'
import { fail as failCli, parseCli } from './args.ts'
import type { SourceMessage } from '../compiler/merge.ts'
import type { PoEntry } from '../compiler/po.ts'

const NAME = 'i18n-extract'
const MACRO_MODULE = 'best-i18n/macro'
const COMPONENT_MODULE = 'best-i18n/react/macro'
const SVELTE_COMPONENT_MODULE = 'best-i18n/svelte/macro'
const SOLID_COMPONENT_MODULE = 'best-i18n/solid/macro'
const EXTENSIONS = new Set([
  '.svelte',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.output', '.wrangler'])

/** The command line, as cac hands it over. */
interface Options {
  locales?: string
  base?: string
  src?: string[]
  messages: string
  tag: string
  component: string
  hook: string
  from: string
  componentFrom: string
  hookFrom: string
  check?: boolean
  force?: boolean
}

/** The command line, validated and with defaults applied. */
interface Config {
  locales: string[]
  base: string
  roots: string[]
  messagesDir: string
  tag: string
  component: string
  hook: string
  from: string[]
  componentFrom: string[]
  hookFrom: string[]
  /** Write nothing; exit 1 if anything would have been written. */
  check: boolean
  /** Allow a write that drops translations. */
  force: boolean
}

/** What the write phase learns, which decides the exit code and the summary. */
interface Report {
  /** A catalog was (or, under `--check`, would have been) written. */
  dirty: boolean
  /** Entries still empty or fuzzy, across every locale. */
  untranslated: number
  /** Translations whose placeholders disagree with their source. */
  mismatched: number
  /** A locale refused to shrink; the exit code says so. */
  refused: boolean
  /** Catalogs that did not exist and were started from scratch. */
  bootstrapped: string[]
}

const out = (line: string) => process.stdout.write(`${line}\n`)
const fail: (message: string) => never = (message) => failCli(NAME, message)

function main(): number {
  const config = configure()
  const { found, scanned } = collect(config)
  out(`  scanned ${scanned} file(s), ${found.length} message(s)`)

  const report: Report = {
    dirty: false,
    untranslated: 0,
    mismatched: 0,
    refused: false,
    bootstrapped: [],
  }
  writeTemplate(config, found, report)
  for (const locale of config.locales.filter((item) => item !== config.base)) {
    writeLocale(config, locale, found, report)
  }
  return summarize(config, report)
}

// ------------------------------------------------------------- configure

function configure(): Config {
  const options = parseCli<Options>(
    NAME,
    'collect t`` messages into PO catalogs',
    `  Writes messages/messages.pot (the template, source texts) and merges every
  target locale's messages/<locale>.po. Hand the .po files to a translator or an
  LLM, then run i18n-compile to produce the JSON the build consumes.`,
    (command) =>
      command
        .option(
          '--locales <list>',
          'comma separated, first one is the base locale',
        )
        .option('--base <locale>', 'override the base locale')
        .option(
          '--src <dir>',
          'source root to scan, repeatable (default: src)',
          { type: [] },
        )
        .option('--messages <dir>', 'catalog directory', {
          default: 'messages',
        })
        .option('--tag <name>', 'macro export to collect', { default: 't' })
        .option('--component <name>', 'component macro to collect', {
          default: 'Trans',
        })
        .option('--hook <name>', 'hook macro export to collect', {
          default: 'useI18n',
        })
        .option('--from <list>', 'modules exporting the macro', {
          default: MACRO_MODULE,
        })
        .option(
          '--component-from <list>',
          'modules exporting the component macro',
          {
            default: [
              COMPONENT_MODULE,
              SVELTE_COMPONENT_MODULE,
              SOLID_COMPONENT_MODULE,
            ].join(','),
          },
        )
        .option('--hook-from <list>', 'modules exporting the hook macro', {
          default: COMPONENT_MODULE,
        })
        .option('--check', 'write nothing, exit 1 if out of date')
        .option(
          '--force',
          'allow a write that reduces the number of translations',
        ),
  )

  const locales = options.locales?.split(',').filter(Boolean) ?? []
  if (locales.length === 0) fail('--locales is required')
  const roots = options.src ?? []

  return {
    locales,
    base: options.base ?? locales[0]!,
    roots: roots.length > 0 ? roots : ['src'],
    messagesDir: options.messages,
    tag: options.tag,
    component: options.component,
    hook: options.hook,
    from: options.from.split(','),
    componentFrom: options.componentFrom.split(','),
    hookFrom: options.hookFrom.split(','),
    check: options.check === true,
    force: options.force === true,
  }
}

// --------------------------------------------------------------- collect

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (EXTENSIONS.has(path.extname(entry.name))) yield full
  }
}

/** Every message under the source roots, one entry per distinct message. */
function collect(config: Config): {
  found: SourceMessage[]
  scanned: number
} {
  const { tag, from, hook, hookFrom, component, componentFrom } = config
  const specifiers = [...from, ...componentFrom, ...hookFrom]
  const byKey = new Map<string, SourceMessage>()
  let scanned = 0

  // Identified the way gettext identifies an entry: context plus text (plus
  // plural form). The build keys its catalog the same way, so the two can
  // never disagree.
  const keyOf = (context: string, text: string, pluralText?: string) =>
    `${context}\u0004${text}${pluralText === undefined ? '' : `\u0005${pluralText}`}`

  for (const root of config.roots) {
    for (const file of walk(root)) {
      const code = readFileSync(file, 'utf8')
      // A macro has to be imported to be used, so naming none of these modules
      // is proof that there is nothing here to collect - and the only such
      // proof that survives an aliased import.
      if (!specifiers.some((specifier) => code.includes(specifier))) continue

      scanned++

      for (const message of extract(code, file, {
        tag,
        from,
        hook,
        hookFrom,
        component,
        componentFrom,
      })) {
        const key = keyOf(message.context, message.text, message.plural?.other)
        const reference = `${file}:${message.line}`
        const seen = byKey.get(key)

        if (seen === undefined) {
          byKey.set(key, {
            context: message.context,
            text: message.text,
            ...(message.plural === undefined
              ? {}
              : { pluralText: message.plural.other }),
            ...(message.description === undefined
              ? {}
              : { description: message.description }),
            references: [reference],
          })
          continue
        }

        if (!seen.references.includes(reference)) {
          seen.references.push(reference)
        }
        // The same message may carry its description at only one call site.
        if (
          seen.description === undefined &&
          message.description !== undefined
        ) {
          seen.description = message.description
        }
      }
    }
  }

  return { found: [...byKey.values()], scanned }
}

// ----------------------------------------------------------------- write

/** Writes `text` to `file` unless the parsed catalog there already matches. */
function writeIfChanged(
  config: Config,
  report: Report,
  file: string,
  locale: string,
  entries: PoEntry[],
  text: string,
): void {
  let changed = true
  try {
    changed = !samePo(parsePo(readFileSync(file, 'utf8'), locale), {
      locale,
      entries,
    })
  } catch {
    changed = true
  }
  if (!changed) return

  report.dirty = true
  out(`  ${config.check ? 'stale' : 'wrote'}:   ${file}`)
  if (!config.check) {
    mkdirSync(config.messagesDir, { recursive: true })
    writeFileSync(file, text)
  }
}

/** The template carries the source texts with empty msgstr. */
function writeTemplate(
  config: Config,
  found: SourceMessage[],
  report: Report,
): void {
  const file = path.join(config.messagesDir, 'messages.pot')
  const text = formatPo({
    locale: config.base,
    entries: found.map((message) => ({
      context: message.context,
      source: message.text,
      target: '',
      ...(message.pluralText === undefined
        ? {}
        : { pluralSource: message.pluralText, pluralTargets: [''] }),
      ...(message.description === undefined
        ? {}
        : { extracted: message.description }),
      references: message.references,
      fuzzy: false,
      obsolete: false,
    })),
  })
  const entries = parsePo(text, config.base).entries
  writeIfChanged(config, report, file, config.base, entries, text)
}

/**
 * A missing catalog bootstraps an empty one, which is right on a first run and
 * a disaster on any later one: every translation would be rewritten as empty.
 * It is therefore reported, so an unexpected bootstrap is visible rather than
 * silent.
 */
function readPo(config: Config, report: Report, locale: string) {
  const file = path.join(config.messagesDir, `${locale}.po`)
  try {
    return parsePo(readFileSync(file, 'utf8'), locale)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      report.bootstrapped.push(file)
      return { locale, entries: [] }
    }
    throw error
  }
}

/**
 * Placeholder sets of msgid and msgstr must agree: a dropped `{0}` or `<1>`
 * silently loses content, an invented one fails the build. Reported here so a
 * TMS import surfaces the problem before anyone runs a build.
 */
function placeholderIssue(source: string, target: string): string | undefined {
  const collect = (text: string, pattern: RegExp) =>
    new Set([...text.matchAll(pattern)].map((match) => match[1]!))

  const compare = (
    pattern: RegExp,
    render: (token: string) => string,
  ): string | undefined => {
    const wanted = collect(source, pattern)
    const got = collect(target, pattern)
    for (const token of wanted) {
      if (!got.has(token)) return `drops ${render(token)}`
    }
    for (const token of got) {
      if (!wanted.has(token)) return `adds ${render(token)}`
    }
    return undefined
  }

  return (
    compare(/(?<!\$)\{([A-Za-z0-9_$]+)\}/g, (token) => `{${token}}`) ??
    compare(/<\/?([A-Za-z0-9_$]+)\s*\/?>/g, (token) => `<${token}>`)
  )
}

/** Merges what was found into one locale's catalog and reports on it. */
function writeLocale(
  config: Config,
  locale: string,
  found: SourceMessage[],
  report: Report,
): void {
  const existing = readPo(config, report, locale)
  const merged = mergeMessages({ found, existing: existing.entries })
  const file = path.join(config.messagesDir, `${locale}.po`)

  // Refusing to shrink is the one guard that makes silent translation loss
  // impossible, whatever the cause upstream.
  const before = existing.entries.filter((entry) => entry.target !== '').length
  const after = merged.entries.filter((entry) => entry.target !== '').length

  if (after < before && !config.force) {
    out(
      `\n  ${locale}: refusing to write - would drop ${before - after} of ` +
        `${before} translation(s).\n  Check that the macro import still ` +
        `resolves, then re-run with --force if this is intended.`,
    )
    report.refused = true
    return
  }

  const missing = merged.entries.filter(
    (entry) =>
      !entry.obsolete &&
      (entry.target === '' || (entry.pluralTargets ?? []).includes('')),
  ).length
  const fuzzy = merged.entries.filter(
    (entry) => !entry.obsolete && entry.fuzzy,
  ).length
  report.untranslated += missing + fuzzy

  if (report.bootstrapped.includes(file)) {
    out(`  * ${locale}.po did not exist - creating it from scratch`)
  }

  out(
    `  ${locale}: ${merged.translated} translated, ${missing} empty, ` +
      `${fuzzy} fuzzy, ${merged.obsoleted.length} obsolete`,
  )
  for (const change of merged.carried) {
    out(`    ~ carried (fuzzy): "${change.from}" -> "${change.to}"`)
  }

  // Fuzzy entries are already counted as needing work and do not build.
  // Plural forms may legitimately drop placeholders, so only singular
  // entries are compared here; the build validates plural forms itself.
  for (const entry of merged.entries) {
    if (entry.obsolete || entry.fuzzy || entry.target === '') continue
    if (entry.pluralSource !== undefined) continue
    const issue = placeholderIssue(entry.source, entry.target)
    if (issue === undefined) continue
    report.mismatched++
    out(`    ! placeholder mismatch (${issue}): "${entry.source}"`)
  }

  writeIfChanged(
    config,
    report,
    file,
    locale,
    merged.entries,
    formatPo({ locale, entries: merged.entries }),
  )
}

/** The closing lines, and the exit code they justify. */
function summarize(config: Config, report: Report): number {
  const { dirty, untranslated, mismatched, refused } = report

  if (config.check) {
    if (dirty || untranslated > 0 || mismatched > 0) {
      out('\n  catalogs are out of date or incomplete')
      return 1
    }
    out('  up to date')
    return refused ? 1 : 0
  }

  if (untranslated > 0) {
    out(`\n  ${untranslated} message(s) need translation - edit the .po files`)
  }
  if (mismatched > 0) {
    out(
      `  ${mismatched} translation(s) have mismatched placeholders - ` +
        'the build will refuse them',
    )
  }
  return refused ? 1 : 0
}

process.exitCode = main()
