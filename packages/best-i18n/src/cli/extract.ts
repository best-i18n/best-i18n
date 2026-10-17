#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { loadConfigFile } from '../compiler/config-file.ts'
import { mergeMessages } from '../compiler/merge.ts'
import { formatPo, parsePo, samePo } from '../compiler/po.ts'
import {
  commonShard,
  fileOfReference,
  findShards,
  shardDir,
  shardOf,
} from '../compiler/shards.ts'
import { extract } from '../compiler/transform.ts'
import { fail as failCli, parseCli } from './args.ts'
import type { ResolvedConfig } from '../compiler/config-file.ts'
import type { SourceMessage } from '../compiler/merge.ts'
import type { PoEntry } from '../compiler/po.ts'
import type { SplitOptions } from '../compiler/shards.ts'

const NAME = 'i18n-extract'
const MACRO_MODULE = 'best-i18n/macro'
const COMPONENT_MODULE = 'best-i18n/react/macro'
const SVELTE_COMPONENT_MODULE = 'best-i18n/svelte/macro'
const SOLID_COMPONENT_MODULE = 'best-i18n/solid/macro'
const VUE_COMPONENT_MODULE = 'best-i18n/vue/macro'
const EXTENSIONS = new Set([
  '.svelte',
  '.vue',
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
  config?: string
  locales?: string
  base?: string
  src?: Array<string | undefined>
  messages?: string
  tag?: string
  component?: string
  hook?: string
  from?: string
  componentFrom?: string
  hookFrom?: string
  check?: boolean
  force?: boolean
  splitDepth?: string
  splitRoot?: string
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
  /** Shard the catalog by source directory; unset writes one catalog. */
  split: SplitOptions | undefined
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

// Identified the way gettext identifies an entry: context plus text (plus
// plural form). The build keys its catalog the same way, so the two can
// never disagree.
const keyOf = (context: string, text: string, pluralText?: string) =>
  `${context}\u0004${text}${pluralText === undefined ? '' : `\u0005${pluralText}`}`

const keyOfMessage = (message: SourceMessage) =>
  keyOf(message.context, message.text, message.pluralText)

const keyOfEntry = (entry: PoEntry) =>
  keyOf(entry.context, entry.source, entry.pluralSource)

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

  // Every locale is merged as one catalog, whatever the shards on disk say:
  // a reworded message has to find its old translation even when the
  // rewording moved it to another shard. Only the write splits it again.
  const existing = findShards(config.messagesDir)
  const targets = new Map(
    found.map((message) => [keyOfMessage(message), targetOf(config, message)]),
  )
  const live = new Set(targets.values())
  if (live.size === 0) live.add('')

  const merged = new Map<string, LocaleShards>()
  for (const locale of config.locales.filter((item) => item !== config.base)) {
    const result = mergeLocale(config, locale, found, existing, targets, report)
    if (result === undefined) continue
    merged.set(locale, result)
    for (const shard of result.shards.keys()) live.add(shard)
  }

  for (const shard of [...live].sort()) {
    writeTemplate(
      config,
      shard,
      found.filter((message) => targets.get(keyOfMessage(message)) === shard),
      report,
    )
    for (const [locale, result] of merged) {
      writeLocale(config, shard, locale, result, report)
    }
  }

  // A refused locale still has translations in the old layout; removing a
  // shard now would take them with it.
  if (!report.refused) {
    for (const shard of existing) {
      if (!live.has(shard)) removeShard(config, shard, report)
    }
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
  LLM, then run i18n-compile to produce the JSON the build consumes.

  Options not given here are read from i18n.config.ts, when there is one.`,
    (command) =>
      command
        .option(
          '--config <file>',
          'config file (default: i18n.config.{ts,mts,js,mjs})',
        )
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
        .option('--messages <dir>', 'catalog directory (default: messages)')
        .option('--tag <name>', 'macro export to collect (default: t)')
        .option(
          '--component <name>',
          'component macro to collect (default: Trans)',
        )
        .option(
          '--hook <name>',
          'hook macro export to collect (default: useI18n)',
        )
        .option(
          '--from <list>',
          `modules exporting the macro (default: ${MACRO_MODULE})`,
        )
        .option(
          '--component-from <list>',
          'modules exporting the component macro (default: best-i18n/*/macro)',
        )
        .option(
          '--hook-from <list>',
          `modules exporting the hook macro (default: ${COMPONENT_MODULE})`,
        )
        .option(
          '--split-depth <n>',
          'shard the catalog by source directory, this many levels deep',
        )
        .option(
          '--split-root <dir>',
          'directory shard paths are relative to (default: the --src root)',
        )
        .option('--check', 'write nothing, exit 1 if out of date')
        .option(
          '--force',
          'allow a write that reduces the number of translations',
        ),
  )

  let file: ResolvedConfig | undefined
  try {
    file = loadConfigFile(
      options.config === undefined ? {} : { file: options.config },
    )?.config
  } catch (error) {
    fail((error as Error).message)
  }
  // The file's paths are absolute; references in the catalogs are written
  // as the walk spells them, so they go back to relative to where it runs.
  const relative = (target: string) =>
    path.relative(process.cwd(), target) || '.'
  const list = (value: string | undefined) => value?.split(',').filter(Boolean)

  const locales = list(options.locales) ?? file?.locales ?? []
  if (locales.length === 0) {
    fail('--locales is required, or an i18n.config.ts that lists them')
  }

  // cac hands an unrepeated array option over as `[undefined]`.
  const flagRoots = (options.src ?? []).filter(
    (root): root is string => typeof root === 'string',
  )
  const roots =
    flagRoots.length > 0 ? flagRoots : (file?.src.map(relative) ?? ['src'])

  let split: SplitOptions | undefined
  if (options.splitDepth !== undefined) {
    const depth = Number(options.splitDepth)
    if (!Number.isInteger(depth) || depth < 1) {
      fail('--split-depth must be a whole number of levels, 1 or more')
    }
    // With several roots there is no one directory to measure from, short of
    // the working directory, which then spends a level on the root's name.
    split = {
      root: options.splitRoot ?? (roots.length === 1 ? roots[0]! : '.'),
      depth,
    }
  } else if (options.splitRoot !== undefined) {
    fail('--split-root needs --split-depth')
  } else if (file?.split !== undefined) {
    split = { root: relative(file.split.root), depth: file.split.depth }
  }

  return {
    locales,
    base:
      options.base ??
      (options.locales === undefined ? file?.baseLocale : undefined) ??
      locales[0]!,
    roots,
    messagesDir:
      options.messages ??
      (file === undefined ? 'messages' : relative(file.messagesDir)),
    tag: options.tag ?? file?.tag ?? 't',
    component: options.component ?? file?.component ?? 'Trans',
    hook: options.hook ?? file?.hook ?? 'useI18n',
    from: list(options.from) ?? file?.from ?? [MACRO_MODULE],
    componentFrom: list(options.componentFrom) ??
      file?.componentFrom ?? [
        COMPONENT_MODULE,
        SVELTE_COMPONENT_MODULE,
        SOLID_COMPONENT_MODULE,
        VUE_COMPONENT_MODULE,
      ],
    hookFrom: list(options.hookFrom) ?? file?.hookFrom ?? [COMPONENT_MODULE],
    check: options.check === true,
    force: options.force === true,
    split,
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

/** The shard a message is written to; the root unless the catalog is split. */
function targetOf(config: Config, message: SourceMessage): string {
  const { split } = config
  if (split === undefined) return ''
  return commonShard(
    message.references.map((reference) =>
      shardOf(fileOfReference(reference), split),
    ),
  )
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
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
}

/** The template carries the source texts with empty msgstr. */
function writeTemplate(
  config: Config,
  shard: string,
  found: SourceMessage[],
  report: Report,
): void {
  const file = path.join(shardDir(config.messagesDir, shard), 'messages.pot')
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
 * One locale's existing entries across every shard, each remembered with the
 * shard it came from.
 *
 * A missing catalog bootstraps an empty one, which is right on a first run and
 * a disaster on any later one: every translation would be rewritten as empty.
 * It is therefore reported, so an unexpected bootstrap is visible rather than
 * silent. A shard without this locale's file is not a bootstrap: extract
 * creates shards as messages move.
 */
function readLocale(
  config: Config,
  report: Report,
  locale: string,
  shards: string[],
): {
  entries: PoEntry[]
  origin: Map<string, string>
  headers: Map<string, Record<string, string>>
} {
  const entries: PoEntry[] = []
  const origin = new Map<string, string>()
  const headers = new Map<string, Record<string, string>>()
  let read = 0

  for (const shard of shards) {
    const file = path.join(shardDir(config.messagesDir, shard), `${locale}.po`)
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    read++
    const po = parsePo(text, locale)
    if (po.headers !== undefined) headers.set(shard, po.headers)
    for (const entry of po.entries) {
      entries.push(entry)
      origin.set(keyOfEntry(entry), shard)
    }
  }

  if (read === 0) {
    report.bootstrapped.push(path.join(config.messagesDir, `${locale}.po`))
  }
  return { entries, origin, headers }
}

/**
 * Where an obsolete entry goes: the shard it was in while that shard still
 * has live messages, otherwise the nearest one above it that does. A shard
 * whose source is gone then goes away with it, and its translations wait in
 * the parent in case the wording comes back.
 */
function obsoleteHome(shard: string, live: Set<string>): string {
  let home = shard
  while (home !== '' && !live.has(home)) {
    home = home.includes('/') ? home.slice(0, home.lastIndexOf('/')) : ''
  }
  return home
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

/** One locale's merged catalog, split by shard, with each shard's headers. */
interface LocaleShards {
  shards: Map<string, PoEntry[]>
  headers: Map<string, Record<string, string>>
}

/**
 * Merges what was found into one locale's catalog, reports on it, and splits
 * the result by shard. `undefined` when the locale refused to shrink and must
 * not be written.
 */
function mergeLocale(
  config: Config,
  locale: string,
  found: SourceMessage[],
  existingShards: string[],
  targets: Map<string, string>,
  report: Report,
): LocaleShards | undefined {
  const existing = readLocale(config, report, locale, existingShards)
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
    return undefined
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

  const live = new Set(targets.values())
  const shards = new Map<string, PoEntry[]>()
  for (const entry of merged.entries) {
    const key = keyOfEntry(entry)
    const shard = entry.obsolete
      ? obsoleteHome(existing.origin.get(key) ?? '', live)
      : (targets.get(key) ?? '')
    const list = shards.get(shard)
    if (list === undefined) shards.set(shard, [entry])
    else list.push(entry)
  }
  return { shards, headers: existing.headers }
}

/**
 * Writes one shard of one locale's merged catalog. Headers a translator or a
 * TMS set - `Plural-Forms` above all - survive the rewrite; a shard that is
 * new takes the root's, so splitting a catalog does not lose them either.
 */
function writeLocale(
  config: Config,
  shard: string,
  locale: string,
  merged: LocaleShards,
  report: Report,
): void {
  const entries = merged.shards.get(shard) ?? []
  const headers =
    merged.headers.get(shard) ??
    merged.headers.get('') ??
    merged.headers.values().next().value
  writeIfChanged(
    config,
    report,
    path.join(shardDir(config.messagesDir, shard), `${locale}.po`),
    locale,
    entries,
    formatPo({
      locale,
      entries,
      ...(headers === undefined ? {} : { headers }),
    }),
  )
}

/**
 * Deletes a shard nothing is written to any more: its template and the
 * configured locales' catalogs, then every directory left empty up to the
 * catalog root. Files it does not own stay, and so does their directory.
 */
function removeShard(config: Config, shard: string, report: Report): void {
  const dir = shardDir(config.messagesDir, shard)
  const names = [
    'messages.pot',
    ...config.locales
      .filter((locale) => locale !== config.base)
      .map((locale) => `${locale}.po`),
  ]

  for (const name of names) {
    const file = path.join(dir, name)
    if (!existsSync(file)) continue
    report.dirty = true
    out(`  ${config.check ? 'stale' : 'removed'}: ${file}`)
    if (!config.check) rmSync(file)
  }
  if (config.check) return

  const root = path.resolve(config.messagesDir)
  for (
    let current = path.resolve(dir);
    current !== root && current.startsWith(root);
    current = path.dirname(current)
  ) {
    try {
      rmdirSync(current)
    } catch {
      return
    }
  }
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
