import { readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * A catalog may be split into shards: subdirectories of `messagesDir` laid
 * out like it, each with its own `messages.pot` and `<locale>.po`. A shard is
 * named by its path relative to `messagesDir`, `/`-separated; the root
 * directory itself is the shard `''`.
 *
 * Only `i18n-extract --split-depth` writes shards. Everything that reads a
 * catalog finds them on disk, so an unsplit catalog - the default - is just
 * the one-shard case and needs no configuration anywhere else.
 */
export interface SplitOptions {
  /** The source directory shard paths are relative to. */
  root: string
  /** How many directory levels below `root` a shard path keeps. */
  depth: number
}

const TEMPLATE = 'messages.pot'
const SKIP_DIRS = new Set(['node_modules'])

/** Every shard under `messagesDir`, the root first, then sorted by path. */
export function findShards(messagesDir: string): string[] {
  const shards: string[] = []

  const visit = (dir: string, shard: string) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    if (entries.some((entry) => entry.isFile() && entry.name === TEMPLATE)) {
      shards.push(shard)
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      visit(
        path.join(dir, entry.name),
        shard === '' ? entry.name : `${shard}/${entry.name}`,
      )
    }
  }

  visit(messagesDir, '')
  return shards.sort(compareShards)
}

/** The root shard first; otherwise plain path order, so output is stable. */
function compareShards(a: string, b: string): number {
  if (a === '') return b === '' ? 0 : -1
  if (b === '') return 1
  return a < b ? -1 : a > b ? 1 : 0
}

/** The directory a shard's files live in. */
export function shardDir(messagesDir: string, shard: string): string {
  return shard === ''
    ? messagesDir
    : path.join(messagesDir, ...shard.split('/'))
}

/**
 * Route segments that carry no meaning of their own: a dynamic `[param]`, a
 * `(group)` and a parallel-route `@slot`. Counting them would spend a level
 * on `app/[locale]` and put a whole Next.js app in one shard.
 */
function isRouteSegment(segment: string): boolean {
  return (
    /^\[.*\]$/.test(segment) ||
    /^\(.*\)$/.test(segment) ||
    segment.startsWith('@')
  )
}

/**
 * The shard a source file's messages belong to: its directory relative to
 * `root`, cut after `depth` counted segments. Route segments ride along
 * between counted ones but never end a shard path, so `app/[locale]/page.tsx`
 * lands in `app` and `app/[locale]/about/page.tsx` in `app/[locale]/about`.
 * A file outside `root`, or directly in it, belongs to the root shard.
 */
export function shardOf(file: string, options: SplitOptions): string {
  const relative = path.relative(options.root, path.dirname(file))
  if (
    relative === '' ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    return ''
  }

  const kept: string[] = []
  let counted = 0
  let end = 0

  for (const segment of relative.split(path.sep)) {
    if (counted === options.depth) break
    kept.push(segment)
    if (isRouteSegment(segment)) continue
    counted++
    end = kept.length
  }

  return kept.slice(0, end).join('/')
}

/**
 * Where a message used from several shards lives: their deepest common
 * ancestor. Shared texts - buttons, navigation - rise on their own, and the
 * root shard ends up as the common catalog without anyone declaring one.
 */
export function commonShard(shards: string[]): string {
  if (shards.length === 0) return ''

  let common = shards[0]!.split('/').filter(Boolean)
  for (const shard of shards.slice(1)) {
    const segments = shard.split('/').filter(Boolean)
    let length = 0
    while (
      length < common.length &&
      length < segments.length &&
      common[length] === segments[length]
    ) {
      length++
    }
    common = common.slice(0, length)
  }

  // Never stop on a route segment: `app/[locale]` for two shards under it
  // would be a shard path `shardOf` itself can never produce.
  while (common.length > 0 && isRouteSegment(common[common.length - 1]!)) {
    common.pop()
  }

  return common.join('/')
}

/** `#: src/app/page.tsx:12` names the file before the last colon. */
export function fileOfReference(reference: string): string {
  return reference.replace(/:\d+$/, '')
}
