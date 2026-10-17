import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatPo, parsePo } from '../src/compiler/po.ts'

const CLI = fileURLToPath(new URL('../src/cli/extract.ts', import.meta.url))

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'best-i18n-extract-'))
  for (const [file, code] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), code)
  }
  return dir
}

function extract(dir: string, ...args: string[]) {
  const result = spawnSync(
    process.execPath,
    [CLI, '--locales', 'en,zh', '--src', 'src', ...args],
    { cwd: dir, encoding: 'utf8' },
  )
  if (result.status !== 0) {
    throw new Error(`i18n-extract failed:\n${result.stderr}${result.stdout}`)
  }
  return result.stdout
}

const sources = (dir: string, file: string) =>
  parsePo(readFileSync(path.join(dir, 'messages', file), 'utf8'), 'zh')
    .entries.filter((entry) => !entry.obsolete)
    .map((entry) => `${entry.source}=${entry.target}`)
    .sort()

const page = (...texts: string[]) =>
  `import { t } from 'best-i18n/macro'\n${texts.map((text) => `t\`${text}\``).join('\n')}\n`

describe('i18n-extract --split-depth', () => {
  it('shards by directory, shares upward, and folds back when unsplit', () => {
    const dir = project({
      'src/app/[locale]/about/page.tsx': page('About us', 'Shared'),
      'src/components/nav.tsx': page('Home', 'Shared'),
      'messages/messages.pot': '',
      'messages/zh.po': formatPo({
        locale: 'zh',
        headers: { 'Plural-Forms': 'nplurals=1; plural=0;' },
        entries: [
          ['About us', '关于我们'],
          ['Home', '首页'],
          ['Shared', '共享'],
        ].map(([source, target]) => ({
          context: '',
          source: source!,
          target: target!,
          references: [],
          fuzzy: false,
          obsolete: false,
        })),
      }),
    })

    extract(dir, '--split-depth', '2')

    expect(sources(dir, 'zh.po')).toEqual(['Shared=共享'])
    expect(sources(dir, 'app/[locale]/about/zh.po')).toEqual([
      'About us=关于我们',
    ])
    expect(sources(dir, 'components/zh.po')).toEqual(['Home=首页'])
    // Every shard keeps the translator's headers, the rewritten root included.
    for (const file of ['zh.po', 'components/zh.po']) {
      expect(readFileSync(path.join(dir, 'messages', file), 'utf8')).toContain(
        'Plural-Forms: nplurals=1; plural=0;',
      )
    }
    expect(extract(dir, '--split-depth', '2', '--check')).toContain(
      'up to date',
    )

    extract(dir)

    expect(sources(dir, 'zh.po')).toEqual([
      'About us=关于我们',
      'Home=首页',
      'Shared=共享',
    ])
    expect(existsSync(path.join(dir, 'messages', 'app'))).toBe(false)
    expect(existsSync(path.join(dir, 'messages', 'components'))).toBe(false)
  })

  it("moves a deleted page's translations up as obsolete, not away", () => {
    const dir = project({
      'src/app/about/page.tsx': page('About us'),
      'src/app/home/page.tsx': page('Home'),
    })
    extract(dir, '--split-depth', '2')
    const po = path.join(dir, 'messages', 'app', 'about', 'zh.po')
    const translated = parsePo(readFileSync(po, 'utf8'), 'zh').entries.map(
      (entry) => ({ ...entry, target: '关于我们' }),
    )
    writeFileSync(po, formatPo({ locale: 'zh', entries: translated }))

    writeFileSync(path.join(dir, 'src/app/about/page.tsx'), '')
    extract(dir, '--split-depth', '2')

    expect(existsSync(path.join(dir, 'messages', 'app', 'about'))).toBe(false)
    const root = parsePo(
      readFileSync(path.join(dir, 'messages', 'zh.po'), 'utf8'),
      'zh',
    )
    expect(root.entries).toContainEqual(
      expect.objectContaining({
        source: 'About us',
        target: '关于我们',
        obsolete: true,
      }),
    )
  })

  it('reads locales, roots and the split from i18n.config', () => {
    const dir = project({
      'i18n.config.mjs':
        "export default { locales: ['en', 'zh'], src: ['app'], messagesDir: 'locales', split: { depth: 1 } }",
      'app/about/page.tsx': page('About us'),
      'app/home/page.tsx': page('Home'),
    })

    const result = spawnSync(process.execPath, [CLI], {
      cwd: dir,
      encoding: 'utf8',
    })

    expect(result.stderr).toBe('')
    expect(existsSync(path.join(dir, 'locales', 'about', 'zh.po'))).toBe(true)
    expect(existsSync(path.join(dir, 'locales', 'home', 'zh.po'))).toBe(true)
    // References stay relative to where the command ran, config or not.
    expect(
      readFileSync(path.join(dir, 'locales', 'about', 'messages.pot'), 'utf8'),
    ).toContain('#: app/about/page.tsx:2')
  })
})
