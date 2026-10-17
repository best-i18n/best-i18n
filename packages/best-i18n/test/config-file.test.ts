import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { loadConfigFile, withConfigFile } from '../src/compiler/config-file.ts'

function project(name: string, code: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'best-i18n-config-'))
  writeFileSync(path.join(dir, name), code)
  return dir
}

describe('loadConfigFile', () => {
  it('finds nothing where there is no config', () => {
    expect(
      loadConfigFile({ cwd: mkdtempSync(path.join(tmpdir(), 'best-i18n-')) }),
    ).toBeUndefined()
  })

  it('loads a TypeScript config and resolves its paths against it', () => {
    const dir = project(
      'i18n.config.ts',
      [
        'interface Config { locales: string[]; src: string[]; split: { depth: number } }',
        "const config: Config = { locales: ['en', 'zh'], src: ['app'], split: { depth: 2 } }",
        'export default config',
      ].join('\n'),
    )

    const loaded = loadConfigFile({ cwd: dir })

    expect(loaded?.file).toBe(path.join(dir, 'i18n.config.ts'))
    expect(loaded?.config).toMatchObject({
      locales: ['en', 'zh'],
      baseLocale: 'en',
      messagesDir: path.join(dir, 'messages'),
      src: [path.join(dir, 'app')],
      // One source root: shards are measured from it.
      split: { depth: 2, root: path.join(dir, 'app') },
    })
  })

  it('loads a named JavaScript config', () => {
    const dir = project(
      'custom.mjs',
      "export default { locales: ['zh', 'en'], baseLocale: 'en' }",
    )

    expect(
      loadConfigFile({ cwd: dir, file: 'custom.mjs' })?.config.baseLocale,
    ).toBe('en')
  })

  it('names the file and the problem', () => {
    const dir = project(
      'i18n.config.mjs',
      "export default { locales: ['en'], baseLocale: 'zh' }",
    )

    expect(() => loadConfigFile({ cwd: dir })).toThrow(
      /i18n\.config\.mjs: `baseLocale` "zh" is not one of `locales`/,
    )
  })
})

describe('withConfigFile', () => {
  it('fills in what a plugin was not given, and nothing it was', () => {
    const dir = project(
      'i18n.config.mjs',
      "export default { locales: ['en', 'zh'], hookFrom: ['~/i18n'], tag: 'msg' }",
    )
    vi.spyOn(process, 'cwd').mockReturnValue(dir)

    try {
      const options: { tag?: string; locales?: string[] } = { tag: 'tr' }
      expect(withConfigFile('test', options)).toMatchObject({
        locales: ['en', 'zh'],
        baseLocale: 'en',
        messagesDir: path.join(dir, 'messages'),
        hookFrom: ['~/i18n'],
        tag: 'tr',
      })
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('says where locales could have come from', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(
      mkdtempSync(path.join(tmpdir(), 'best-i18n-')),
    )

    try {
      expect(() => withConfigFile('test', {})).toThrow(/i18n\.config\.ts/)
    } finally {
      vi.restoreAllMocks()
    }
  })
})
