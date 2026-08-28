#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { hashId } from '../compiler/id.ts'
import { mergeMessages } from '../compiler/merge.ts'
import { formatPo, parsePo, samePo } from '../compiler/po.ts'
import { extract } from '../compiler/transform.ts'

import type { SourceMessage } from '../compiler/merge.ts'

const HELP = `
  i18n-extract - collect t\`\` messages into PO catalogs

  Writes messages/messages.pot (the template, source texts) and merges every
  target locale's messages/<locale>.po. Hand the .po files to a translator or an
  LLM, then run i18n-compile to produce the JSON the build consumes.

  Usage
    $ i18n-extract --locales en,zh [options]

  Options
    --locales <list>   comma separated, first one is the base locale
    --base <locale>    override the base locale
    --src <dir>        source root to scan, repeatable   (default: src)
    --messages <dir>   catalog directory                 (default: messages)
    --tag <name>       macro export to collect           (default: t)
    --component <name> component macro to collect        (default: Trans)
    --from <list>      modules exporting the macro
    --component-from <list>  modules exporting the component macro
    --check            write nothing, exit 1 if out of date
    --force            allow a write that reduces the number of translations
    -h, --help
`

const MACRO_MODULE = 'best-i18n/macro'
const COMPONENT_MODULE = 'best-i18n/react/macro'
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.output', '.wrangler'])

function fail(message: string): never {
  process.stderr.write(`i18n-extract: ${message}\n`)
  process.exit(1)
}

const argv = process.argv.slice(2)
const src: string[] = []
let locales: string[] = []
let baseOverride: string | undefined
let messagesDir = 'messages'
let tag = 't'
let component = 'Trans'
let from: string[] = [MACRO_MODULE]
let componentFrom: string[] = [COMPONENT_MODULE]
let check = false
let force = false

for (let index = 0; index < argv.length; index++) {
  const arg = argv[index]
  const next = (): string => {
    const value = argv[index + 1]
    if (value === undefined) fail(`${arg} needs a value`)
    index++
    return value
  }

  if (arg === '-h' || arg === '--help') {
    process.stdout.write(HELP)
    process.exit(0)
  } else if (arg === '--locales') locales = next().split(',')
  else if (arg === '--base') baseOverride = next()
  else if (arg === '--src') src.push(next())
  else if (arg === '--messages') messagesDir = next()
  else if (arg === '--tag') tag = next()
  else if (arg === '--component') component = next()
  else if (arg === '--from') from = next().split(',')
  else if (arg === '--component-from') componentFrom = next().split(',')
  else if (arg === '--check') check = true
  else if (arg === '--force') force = true
  else fail(`unknown option ${arg}`)
}

if (locales.length === 0) fail('--locales is required')
const base = baseOverride ?? locales[0]!
const roots = src.length > 0 ? src : ['src']
const out = (line: string) => process.stdout.write(`${line}\n`)

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (EXTENSIONS.has(path.extname(entry.name))) yield full
  }
}

// ---------------------------------------------------------------- collect

const byId = new Map<string, SourceMessage>()
let scanned = 0

for (const root of roots) {
  for (const file of walk(root)) {
    const code = readFileSync(file, 'utf8')
    if (
      !code.includes(`${tag}\``) &&
      !code.includes(`<${component}`) &&
      !from.some((specifier) => code.includes(specifier)) &&
      !componentFrom.some((specifier) => code.includes(specifier))
    ) {
      continue
    }

    scanned++

    for (const message of extract(code, file, {
      tag,
      from,
      component,
      componentFrom,
    })) {
      // The id is derived here and nowhere else: the build looks messages up by
      // their source text, so the two can never disagree.
      const id = hashId(message.text)
      const reference = `${file}:${message.line}`
      const seen = byId.get(id)

      if (seen === undefined) {
        byId.set(id, { id, text: message.text, references: [reference] })
      } else if (!seen.references.includes(reference)) {
        seen.references.push(reference)
      }
    }
  }
}

const found = [...byId.values()]
out(`  scanned ${scanned} file(s), ${found.length} message(s)`)

// ---------------------------------------------------------------- write

const bootstrapped: string[] = []

/**
 * A missing catalog bootstraps an empty one, which is right on a first run and
 * a disaster on any later one: every translation would be rewritten as empty.
 * It is therefore reported, so an unexpected bootstrap is visible rather than
 * silent.
 */
function readPo(locale: string) {
  const file = path.join(messagesDir, `${locale}.po`)
  try {
    return parsePo(readFileSync(file, 'utf8'), locale)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      bootstrapped.push(file)
      return { locale, entries: [] }
    }
    throw error
  }
}

let dirty = false
let untranslated = 0

// The template carries the source texts with empty msgstr.
const templateFile = path.join(messagesDir, 'messages.pot')
const template = formatPo({
  locale: base,
  entries: found.map((message) => ({
    id: message.id,
    source: message.text,
    target: '',
    references: message.references,
    fuzzy: false,
    obsolete: false,
  })),
})

const templateFile2 = { locale: base, entries: parsePo(template, base).entries }
let templateChanged = true
try {
  templateChanged = !samePo(
    parsePo(readFileSync(templateFile, 'utf8'), base),
    templateFile2,
  )
} catch {
  templateChanged = true
}

if (templateChanged) {
  dirty = true
  out(`  ${check ? 'stale' : 'wrote'}:   ${templateFile}`)
  if (!check) {
    mkdirSync(messagesDir, { recursive: true })
    writeFileSync(templateFile, template)
  }
}

for (const locale of locales.filter((item) => item !== base)) {
  const existing = readPo(locale)
  const merged = mergeMessages({ found, existing: existing.entries })
  const file = path.join(messagesDir, `${locale}.po`)
  const text = formatPo({ locale, entries: merged.entries })

  // Refusing to shrink is the one guard that makes silent translation loss
  // impossible, whatever the cause upstream.
  const before = existing.entries.filter((entry) => entry.target !== '').length
  const after = merged.entries.filter((entry) => entry.target !== '').length

  if (after < before && !force) {
    out(
      `\n  ${locale}: refusing to write - would drop ${before - after} of ` +
        `${before} translation(s).\n  Check that the macro import still ` +
        `resolves, then re-run with --force if this is intended.`,
    )
    process.exitCode = 1
    continue
  }

  const missing = merged.entries.filter(
    (entry) => !entry.obsolete && entry.target === '',
  ).length
  const fuzzy = merged.entries.filter(
    (entry) => !entry.obsolete && entry.fuzzy,
  ).length
  untranslated += missing + fuzzy

  if (bootstrapped.includes(file)) {
    out(`  * ${locale}.po did not exist - creating it from scratch`)
  }

  out(
    `  ${locale}: ${merged.translated} translated, ${missing} empty, ` +
      `${fuzzy} fuzzy, ${merged.obsoleted.length} obsolete`,
  )
  for (const change of merged.carried) {
    out(`    ~ carried (fuzzy): "${change.from}" -> "${change.to}"`)
  }

  let changed = true
  try {
    changed = !samePo(parsePo(readFileSync(file, 'utf8'), locale), {
      locale,
      entries: merged.entries,
    })
  } catch {
    changed = true
  }

  if (changed) {
    dirty = true
    out(`  ${check ? 'stale' : 'wrote'}:   ${file}`)
    if (!check) {
      mkdirSync(messagesDir, { recursive: true })
      writeFileSync(file, text)
    }
  }
}

if (check) {
  if (dirty || untranslated > 0) {
    out('\n  catalogs are out of date or incomplete')
    process.exitCode = 1
  } else {
    out('  up to date')
  }
} else if (untranslated > 0) {
  out(`\n  ${untranslated} message(s) need translation - edit the .po files`)
}
