import type { PoEntry } from './po.ts'

export interface SourceMessage {
  id: string
  text: string
  references: string[]
}

export interface MergeResult {
  entries: PoEntry[]
  /** New messages with no previous translation. */
  added: string[]
  /** Carried over from a reworded message, so marked fuzzy for review. */
  carried: Array<{ id: string; from: string; to: string }>
  /** No longer in the source; kept as obsolete. */
  obsoleted: string[]
  /** Translated and not fuzzy. */
  translated: number
}

/**
 * Merges freshly extracted messages into an existing PO file.
 *
 * Ids are content hashes, so rewording a message produces a brand new id. To
 * avoid orphaning the translation, an unmatched new message is matched against
 * old entries by source reference: same place in the code means it is the same
 * message reworded, so the translation is carried over and flagged fuzzy.
 *
 * Nothing is ever deleted. Entries that stop appearing become obsolete (`#~`),
 * which keeps their translation available if the wording comes back.
 */
export function mergeMessages(options: {
  found: SourceMessage[]
  existing: PoEntry[]
}): MergeResult {
  const { found, existing } = options

  const byId = new Map(existing.map((entry) => [entry.id, entry]))
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
    const sameId = byId.get(message.id)

    if (sameId !== undefined) {
      consumed.add(sameId)
      entries.push({
        ...sameId,
        source: message.text,
        references: message.references,
        obsolete: false,
      })
      continue
    }

    const reworded = message.references
      .map((reference) => byReference.get(reference))
      .find((entry) => entry !== undefined && !consumed.has(entry))

    if (reworded !== undefined && reworded.target !== '') {
      consumed.add(reworded)
      carried.push({ id: message.id, from: reworded.source, to: message.text })
      entries.push({
        id: message.id,
        source: message.text,
        target: reworded.target,
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
        obsolete: false,
      })
      continue
    }

    if (reworded !== undefined) consumed.add(reworded)

    added.push(message.id)
    entries.push({
      id: message.id,
      source: message.text,
      target: '',
      references: message.references,
      fuzzy: false,
      obsolete: false,
    })
  }

  const obsoleted: string[] = []
  for (const entry of existing) {
    if (consumed.has(entry)) continue
    // Never drop a translation, even for a message that is gone.
    if (entry.target === '') continue

    obsoleted.push(entry.id)
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
