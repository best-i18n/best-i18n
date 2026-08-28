import { createHash } from 'node:crypto'

/**
 * Content hash of the message text, base64url, 8 characters (48 bits).
 *
 * A hash is stable, uniform and never an arbitrary truncation of the wording.
 * The cost is that editing the text changes the id, which alone would orphan
 * every translation. That is why the catalogs are PO files: they keep the
 * source text and the source references, so an edit can be matched back to the
 * previous entry and carried over as fuzzy instead of lost.
 */
export function hashId(text: string): string {
  return createHash('sha256')
    .update(text, 'utf8')
    .digest('base64url')
    .slice(0, 8)
}
