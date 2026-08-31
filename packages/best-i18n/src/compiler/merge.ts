import type { PoEntry } from './po.ts'

export interface SourceMessage {
  /** `msgctxt` disambiguation, empty for none. */
  context: string
  text: string
  /** `msgid_plural`, for a plural message. */
  pluralText?: string
  /** `#.` comment for the translator, from a `// i18n:` comment in source. */
  description?: string
  references: string[]
}

export interface MergeResult {
  entries: PoEntry[]
  /** New messages with no previous translation. */
  added: string[]
  /** Carried over from a reworded message, so marked fuzzy for review. */
  carried: Array<{ from: string; to: string }>
  /** No longer in the source; kept as obsolete. */
  obsoleted: string[]
  /** Translated and not fuzzy. */
  translated: number
}

/**
 * How a message is identified: its context plus its text (and plural form),
 * which is exactly how gettext identifies an entry. Rewording a message
 * therefore produces a brand new key - see the reference matching below.
 */
function keyOf(context: string, text: string, pluralText?: string): string {
  const base = `${context}\u0004${text}`
  return pluralText === undefined ? base : `${base}\u0005${pluralText}`
}

/**
 * Merges freshly extracted messages into an existing PO file.
 *
 * Rewording a message changes its identity. To avoid orphaning the
 * translation, an unmatched new message is matched against old entries by
 * source reference: same place in the code means it is the same message
 * reworded, so the translation is carried over and flagged fuzzy.
 *
 * Nothing is ever deleted. Entries that stop appearing become obsolete (`#~`),
 * which keeps their translation available if the wording comes back.
 */
export function mergeMessages(options: {
  found: SourceMessage[]
  existing: PoEntry[]
}): MergeResult {
  const { found, existing } = options

  const byKey = new Map(
    existing.map((entry) => [
      keyOf(entry.context, entry.source, entry.pluralSource),
      entry,
    ]),
  )
  const byReference = new Map<string, PoEntry>()
  for (const entry of existing) {
    for (const reference of entry.references) {
      if (!byReference.has(reference)) byReference.set(reference, entry)
    }
  }

  const consumed = new Set<PoEntry>()
  const entries: PoEntry[] = []
  const added: string[] = []
  const carried: MergeResult['carried'] = []

  for (const message of found) {
    const same = byKey.get(
      keyOf(message.context, message.text, message.pluralText),
    )

    if (same !== undefined) {
      consumed.add(same)
      const merged: PoEntry = {
        ...same,
        source: message.text,
        references: message.references,
        obsolete: false,
      }
      // The extractor owns `#.`: descriptions follow the source comment,
      // including going away when the comment does.
      if (message.description === undefined) delete merged.extracted
      else merged.extracted = message.description
      entries.push(merged)
      continue
    }

    const reworded = message.references
      .map((reference) => byReference.get(reference))
      .find((entry) => entry !== undefined && !consumed.has(entry))

    if (reworded !== undefined && reworded.target !== '') {
      consumed.add(reworded)
      carried.push({ from: reworded.source, to: message.text })
      entries.push({
        context: message.context,
        source: message.text,
        target: reworded.target,
        ...(message.pluralText === undefined
          ? {}
          : {
              pluralSource: message.pluralText,
              pluralTargets: reworded.pluralTargets ?? [],
            }),
        references: message.references,
        // The translation was written for the old wording: needs a human look.
        fuzzy: true,
        // What msgmerge would write: the old wording, so the reviewer can see
        // what the carried translation was actually written for.
        previous: `msgid ${JSON.stringify(reworded.source)}`,
        ...(reworded.translator === undefined
          ? {}
          : { translator: reworded.translator }),
        ...(reworded.flags === undefined ? {} : { flags: reworded.flags }),
        ...(message.description === undefined
          ? {}
          : { extracted: message.description }),
        obsolete: false,
      })
      continue
    }

    if (reworded !== undefined) consumed.add(reworded)

    added.push(message.text)
    entries.push({
      context: message.context,
      source: message.text,
      target: '',
      ...(message.pluralText === undefined
        ? {}
        : { pluralSource: message.pluralText, pluralTargets: [''] }),
      references: message.references,
      fuzzy: false,
      ...(message.description === undefined
        ? {}
        : { extracted: message.description }),
      obsolete: false,
    })
  }

  const obsoleted: string[] = []
  for (const entry of existing) {
    if (consumed.has(entry)) continue
    // Never drop a translation, even for a message that is gone.
    if (entry.target === '') continue

    obsoleted.push(entry.source)
    entries.push({ ...entry, references: [], obsolete: true })
  }

  return {
    entries,
    added,
    carried,
    obsoleted,
    translated: entries.filter(
      (entry) => !entry.obsolete && entry.target !== '' && !entry.fuzzy,
    ).length,
  }
}
