import { readFileSync } from 'node:fs'

/**
 * Reads a fixture case's input, e.g. `fixture('transform/escapes/input.ts')`.
 * The expected halves next to it (`output.*`, `messages.json`) are written by
 * `toMatchFileSnapshot` - refresh them with `vitest run -u`.
 */
export function fixture(relative: string): string {
  return readFileSync(
    new URL(`../fixtures/${relative}`, import.meta.url),
    'utf8',
  )
}

/** Pretty JSON with a trailing newline, for `toMatchFileSnapshot` fixtures. */
export function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}
