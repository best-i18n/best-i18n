import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { commonShard, findShards, shardOf } from '../src/compiler/shards.ts'

describe('shardOf', () => {
  const split = { root: 'src', depth: 2 }

  it('keeps `depth` directory levels below the root', () => {
    expect(shardOf('src/features/billing/ui/invoice.tsx', split)).toBe(
      'features/billing',
    )
    expect(shardOf('src/components/header.tsx', split)).toBe('components')
  })

  it('puts files in the root, or outside it, in the root shard', () => {
    expect(shardOf('src/main.tsx', split)).toBe('')
    expect(shardOf('lib/util.ts', split)).toBe('')
  })

  it('does not count route segments, and never ends on one', () => {
    expect(shardOf('src/app/[locale]/about/page.tsx', split)).toBe(
      'app/[locale]/about',
    )
    expect(shardOf('src/app/[locale]/page.tsx', split)).toBe('app')
    expect(
      shardOf('src/routes/(marketing)/@modal/pricing/x.svelte', split),
    ).toBe('routes/(marketing)/@modal/pricing')
  })
})

describe('commonShard', () => {
  it('is the deepest shared ancestor', () => {
    expect(commonShard(['app/about', 'app/blog'])).toBe('app')
    expect(commonShard(['app/about', 'components'])).toBe('')
    expect(commonShard(['app/about', 'app/about'])).toBe('app/about')
  })

  it('backs off a route segment', () => {
    expect(commonShard(['app/[locale]/about', 'app/[locale]/long'])).toBe('app')
  })
})

describe('findShards', () => {
  it('lists every directory holding a template, the root first', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'best-i18n-'))
    for (const shard of ['', 'b', 'a/x', 'a/no-template']) {
      mkdirSync(path.join(dir, shard), { recursive: true })
      if (shard !== 'a/no-template') {
        writeFileSync(path.join(dir, shard, 'messages.pot'), '')
      }
    }

    expect(findShards(dir)).toEqual(['', 'a/x', 'b'])
  })

  it('finds nothing in a directory that does not exist', () => {
    expect(findShards(path.join(tmpdir(), 'best-i18n-missing-dir'))).toEqual([])
  })
})
