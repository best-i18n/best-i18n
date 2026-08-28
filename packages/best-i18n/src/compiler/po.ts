import { po as poCodec } from 'gettext-parser'

export interface PoEntry {
  /** Message id, carried in `msgctxt`. */
  id: string
  /** Source text, carried in `msgid`. */
  source: string
  /** Translation, empty when untranslated. */
  target: string
  /** `#: file:line` references. */
  references: string[]
  /** `#, fuzzy` - translated but the source changed since. */
  fuzzy: boolean
  /** `#~` - no longer in the source, kept so the translation is not lost. */
  obsolete: boolean
}

export interface PoFile {
  locale: string
  entries: PoEntry[]
  project?: string
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
      entry.id,
      entry.source,
      entry.target,
      [...entry.references].sort(),
      entry.fuzzy,
      entry.obsolete,
    ])

  const left = a.entries.map(key).sort()
  const right = b.entries.map(key).sort()

  return left.length === right.length && left.every((v, i) => v === right[i])
}

const OBSOLETE_PREFIX = '#~ '

function flagsOf(comments: { flag?: string } | undefined): boolean {
  return (comments?.flag ?? '').split(',').includes('fuzzy')
}

/**
 * Parses a PO file.
 *
 * `gettext-parser` drops `#~` obsolete blocks, so they are lifted out first and
 * parsed as a second document. Losing them would defeat the point of keeping
 * translations around across a wording change.
 */
export function parsePo(text: string, locale: string): PoFile {
  const live: string[] = []
  const dead: string[] = []

  for (const line of text.split('\n')) {
    if (line.startsWith(OBSOLETE_PREFIX))
      dead.push(line.slice(OBSOLETE_PREFIX.length))
    else if (line.trimEnd() === '#~') dead.push('')
    else live.push(line)
  }

  const read = (source: string, obsolete: boolean): PoEntry[] => {
    if (source.trim() === '') return []
    const parsed = poCodec.parse(source)
    const entries: PoEntry[] = []

    for (const context of Object.values(parsed.translations)) {
      for (const translation of Object.values(context)) {
        // The header entry has an empty msgid.
        if (translation.msgid === '') continue

        entries.push({
          id: translation.msgctxt ?? '',
          source: translation.msgid,
          target: translation.msgstr[0] ?? '',
          references: (translation.comments?.reference ?? '')
            .split('\n')
            .filter((reference) => reference !== ''),
          fuzzy: flagsOf(translation.comments),
          obsolete,
        })
      }
    }

    return entries
  }

  return {
    locale,
    entries: [...read(live.join('\n'), false), ...read(dead.join('\n'), true)],
  }
}

/** Serializes a PO file, appending obsolete entries as `#~` blocks. */
export function formatPo(file: PoFile): string {
  const translations: Record<string, Record<string, unknown>> = { '': {} }

  const active = file.entries.filter((entry) => !entry.obsolete)
  const obsolete = file.entries.filter((entry) => entry.obsolete)

  for (const entry of active) {
    translations[entry.id] = {
      [entry.source]: {
        msgctxt: entry.id,
        msgid: entry.source,
        msgstr: [entry.target],
        comments: {
          reference: entry.references.join('\n'),
          ...(entry.fuzzy ? { flag: 'fuzzy' } : {}),
        },
      },
    }
  }

  const body = poCodec
    .compile({
      charset: 'utf-8',
      // GNU gettext expects these exact names and warns about each missing
      // one. PO-Revision-Date is deliberately left out: a timestamp would make
      // the output differ on every run.
      headers: {
        'Project-Id-Version': file.project ?? 'PACKAGE VERSION',
        'Language': file.locale,
        'Language-Team': 'LANGUAGE <LL@li.org>',
        'Last-Translator': 'FULL NAME <EMAIL@ADDRESS>',
        'MIME-Version': '1.0',
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Transfer-Encoding': '8bit',
      },
      translations: translations as never,
    })
    .toString('utf8')

  if (obsolete.length === 0) return body

  const tail = obsolete
    .map((entry) =>
      [
        `msgctxt "${escapePo(entry.id)}"`,
        `msgid "${escapePo(entry.source)}"`,
        `msgstr "${escapePo(entry.target)}"`,
      ]
        .map((line) => `${OBSOLETE_PREFIX}${line}`)
        .join('\n'),
    )
    .join('\n\n')

  return `${body.trimEnd()}\n\n${tail}\n`
}

function escapePo(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
}
