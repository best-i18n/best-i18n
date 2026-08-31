import { po as poCodec } from 'gettext-parser'

export interface PoEntry {
  /**
   * `msgctxt` - the developer-supplied disambiguation context, empty for
   * none. Two messages with the same text and different contexts are
   * different entries, which is exactly what gettext designed the field for:
   * "Open" the verb and "Open" the adjective translate differently.
   */
  context: string
  /** Source text, carried in `msgid`. */
  source: string
  /** Translation, empty when untranslated. For plurals, `msgstr[0]`. */
  target: string
  /** `msgid_plural`, present when the entry is a gettext plural. */
  pluralSource?: string
  /** `msgstr[1..]`, present when the entry is a gettext plural. */
  pluralTargets?: string[]
  /** `#: file:line` references. */
  references: string[]
  /** `#, fuzzy` - translated but the source changed since. */
  fuzzy: boolean
  /** Flags other than fuzzy (`c-format`, `no-wrap`, ...), kept verbatim. */
  flags?: string[]
  /** `#.` comments, written by the extractor for the translator. */
  extracted?: string
  /** `#` comments, written by the translator. */
  translator?: string
  /** `#|` previous-msgid comments, written by msgmerge across a rewording. */
  previous?: string
  /** `#~` - no longer in the source, kept so the translation is not lost. */
  obsolete: boolean
}

export interface PoFile {
  locale: string
  entries: PoEntry[]
  project?: string
  /**
   * The file's own headers, preserved across a rewrite. A TMS or a translator
   * sets `Plural-Forms`, `Last-Translator`, `X-Generator` and expects them to
   * survive the next extract run.
   */
  headers?: Record<string, string>
}

/**
 * Compares two PO files by content rather than by bytes.
 *
 * Line wrapping is cosmetic and GNU tools wrap differently than we do, so any
 * editor or `msgmerge` run would otherwise make `--check` report the file as
 * permanently out of date.
 */
export function samePo(a: PoFile, b: PoFile): boolean {
  const key = (entry: PoEntry) =>
    JSON.stringify([
      entry.context,
      entry.source,
      entry.target,
      entry.pluralSource ?? null,
      entry.pluralTargets ?? null,
      [...entry.references].sort(),
      entry.fuzzy,
      [...(entry.flags ?? [])].sort(),
      entry.extracted ?? null,
      entry.translator ?? null,
      entry.obsolete,
    ])

  const left = a.entries.map(key).sort()
  const right = b.entries.map(key).sort()

  return left.length === right.length && left.every((v, i) => v === right[i])
}

const OBSOLETE_PREFIX = '#~ '

interface ParsedComments {
  translator?: string
  reference?: string
  extracted?: string
  flag?: string
  previous?: string
}

function splitFlags(comments: ParsedComments | undefined): {
  fuzzy: boolean
  flags: string[]
} {
  const all = (comments?.flag ?? '')
    .split(',')
    .map((flag) => flag.trim())
    .filter((flag) => flag !== '')

  return {
    fuzzy: all.includes('fuzzy'),
    flags: all.filter((flag) => flag !== 'fuzzy'),
  }
}

/**
 * Parses a PO file.
 *
 * `gettext-parser` drops `#~` obsolete blocks, so they are lifted out first and
 * parsed as a second document. Losing them would defeat the point of keeping
 * translations around across a wording change. The comments directly above an
 * obsolete block belong to it - GNU tools write them unprefixed - so comment
 * lines are only routed once the next non-comment line says which document
 * they sit in.
 */
export function parsePo(text: string, locale: string): PoFile {
  const live: string[] = []
  const dead: string[] = []
  /** Comment/blank lines whose home depends on the next entry line. */
  let pending: string[] = []

  for (const line of text.split('\n')) {
    const trimmed = line.trimEnd()
    if (trimmed.startsWith('#~')) {
      dead.push(...pending)
      pending = []
      if (line.startsWith(OBSOLETE_PREFIX)) dead.push(line.slice(3))
      // `#~|` is msgmerge's obsolete previous-msgid; unprefix to `#|`.
      else if (trimmed.startsWith('#~|')) dead.push(`#${line.slice(2)}`)
      else dead.push('')
    } else if (trimmed === '' || trimmed.startsWith('#')) {
      pending.push(line)
    } else {
      live.push(...pending)
      pending = []
      live.push(line)
    }
  }
  live.push(...pending)

  let headers: Record<string, string> | undefined

  const read = (source: string, obsolete: boolean): PoEntry[] => {
    if (source.trim() === '') return []
    const parsed = poCodec.parse(source)

    if (!obsolete && Object.keys(parsed.headers ?? {}).length > 0) {
      headers = { ...parsed.headers }
    }

    const entries: PoEntry[] = []

    for (const context of Object.values(parsed.translations)) {
      for (const translation of Object.values(context)) {
        // The header entry has an empty msgid.
        if (translation.msgid === '') continue

        const comments = translation.comments as ParsedComments | undefined
        const { fuzzy, flags } = splitFlags(comments)
        const plural = translation.msgid_plural

        entries.push({
          context: translation.msgctxt ?? '',
          source: translation.msgid,
          target: translation.msgstr[0] ?? '',
          ...(plural === undefined || plural === ''
            ? {}
            : {
                pluralSource: plural,
                pluralTargets: translation.msgstr.slice(1),
              }),
          references: (comments?.reference ?? '')
            .split('\n')
            .filter((reference) => reference !== ''),
          fuzzy,
          ...(flags.length > 0 ? { flags } : {}),
          ...(comments?.extracted ? { extracted: comments.extracted } : {}),
          ...(comments?.translator ? { translator: comments.translator } : {}),
          ...(comments?.previous ? { previous: comments.previous } : {}),
          obsolete,
        })
      }
    }

    return entries
  }

  return {
    locale,
    entries: [...read(live.join('\n'), false), ...read(dead.join('\n'), true)],
    ...(headers === undefined ? {} : { headers }),
  }
}

function commentsFor(entry: PoEntry): Record<string, string> {
  const flags = [...(entry.fuzzy ? ['fuzzy'] : []), ...(entry.flags ?? [])]

  return {
    ...(entry.translator ? { translator: entry.translator } : {}),
    ...(entry.extracted ? { extracted: entry.extracted } : {}),
    reference: entry.references.join('\n'),
    ...(flags.length > 0 ? { flag: flags.join(', ') } : {}),
    ...(entry.previous ? { previous: entry.previous } : {}),
  }
}

/** Serializes a PO file, appending obsolete entries as `#~` blocks. */
export function formatPo(file: PoFile): string {
  const translations: Record<string, Record<string, unknown>> = { '': {} }

  const active = file.entries.filter((entry) => !entry.obsolete)
  const obsolete = file.entries.filter((entry) => entry.obsolete)

  for (const entry of active) {
    // Nested assignment, not replacement: entries with no context share the
    // '' bucket with the header entry, and entries with the same context
    // must coexist.
    const bucket = (translations[entry.context] ??= {})
    bucket[entry.source] = {
      // gettext-parser only writes a msgctxt line for a truthy value.
      ...(entry.context === '' ? {} : { msgctxt: entry.context }),
      msgid: entry.source,
      ...(entry.pluralSource === undefined
        ? {}
        : { msgid_plural: entry.pluralSource }),
      msgstr: [entry.target, ...(entry.pluralTargets ?? [])],
      comments: commentsFor(entry),
    }
  }

  const body = poCodec
    .compile({
      charset: 'utf-8',
      // The file's own headers survive a rewrite: a TMS or translator sets
      // Plural-Forms, Last-Translator, X-Generator. GNU gettext expects the
      // structural ones to be exactly these values, so they are pinned, and
      // PO-Revision-Date is deliberately never added: a timestamp would make
      // the output differ on every run.
      headers: {
        'Project-Id-Version': 'PACKAGE VERSION',
        'Language-Team': 'LANGUAGE <LL@li.org>',
        'Last-Translator': 'FULL NAME <EMAIL@ADDRESS>',
        ...file.headers,
        ...(file.project === undefined
          ? {}
          : { 'Project-Id-Version': file.project }),
        'Language': file.locale,
        'MIME-Version': '1.0',
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Transfer-Encoding': '8bit',
      },
      translations: translations as never,
    })
    .toString('utf8')

  if (obsolete.length === 0) return body

  const tail = obsolete.map((entry) => formatObsolete(entry)).join('\n\n')

  return `${body.trimEnd()}\n\n${tail}\n`
}

/**
 * One obsolete entry: comments unprefixed (the way GNU tools write them),
 * entry lines behind `#~`. Keeping the fuzzy flag and references here is what
 * lets an entry go obsolete and come back without losing its state.
 */
function formatObsolete(entry: PoEntry): string {
  const lines: string[] = []

  for (const comment of splitComment(entry.translator)) {
    lines.push(`# ${comment}`)
  }
  for (const comment of splitComment(entry.extracted)) {
    lines.push(`#. ${comment}`)
  }
  if (entry.references.length > 0) {
    lines.push(`#: ${entry.references.join(' ')}`)
  }
  const flags = [...(entry.fuzzy ? ['fuzzy'] : []), ...(entry.flags ?? [])]
  if (flags.length > 0) lines.push(`#, ${flags.join(', ')}`)
  for (const comment of splitComment(entry.previous)) {
    lines.push(`#| ${comment}`)
  }

  const body = [
    ...(entry.context === '' ? [] : [`msgctxt "${escapePo(entry.context)}"`]),
    `msgid "${escapePo(entry.source)}"`,
    ...(entry.pluralSource === undefined
      ? [`msgstr "${escapePo(entry.target)}"`]
      : [
          `msgid_plural "${escapePo(entry.pluralSource)}"`,
          ...[entry.target, ...(entry.pluralTargets ?? [])].map(
            (target, index) => `msgstr[${index}] "${escapePo(target)}"`,
          ),
        ]),
  ].map((line) => `${OBSOLETE_PREFIX}${line}`)

  return [...lines, ...body].join('\n')
}

function splitComment(comment: string | undefined): string[] {
  if (comment === undefined || comment === '') return []
  return comment.split('\n')
}

function escapePo(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}
