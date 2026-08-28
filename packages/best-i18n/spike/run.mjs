// Builds the fixture twice: once per-locale (mode B) and once single-build
// (mode A), then asserts on the real bundles rather than on transform output.
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

import { parsePo } from '../src/compiler/po.ts'
import { i18n } from '../src/integrations/vite.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, 'fixture')
const messagesDir = path.join(root, 'messages')

const LOCALES = ['en', 'zh']

async function bundle(label, staticLocale) {
  const outDir = path.join(here, 'dist', label)
  rmSync(outDir, { recursive: true, force: true })

  await build({
    root,
    logLevel: 'error',
    plugins: [
      i18n({
        messagesDir,
        locales: LOCALES,
        baseLocale: 'en',
        staticLocale,
        // Matched against the literal specifier as written in the source,
        // which is a relative path inside this fixture.
        from: ['../../../src/macro.ts'],
        runtimeModule: path.join(here, '../src/runtime/index.ts'),
      }),
    ],
    build: {
      outDir,
      minify: false,
      lib: {
        entry: path.join(root, 'src/entry.ts'),
        formats: ['es'],
        fileName: 'out',
      },
    },
  })

  return readdirSync(outDir)
    .filter((f) => f.endsWith('.js') || f.endsWith('.mjs'))
    .map((f) => readFileSync(path.join(outDir, f), 'utf8'))
    .join('\n')
}

// Maps a readable alias to the text in the given locale, read from the PO files.
function textsFor(locale) {
  const file = locale === 'en' ? 'messages.pot' : `${locale}.po`
  const parsed = parsePo(
    readFileSync(path.join(messagesDir, file), 'utf8'),
    locale,
  )
  const pick = (needle) => {
    const entry = parsed.entries.find((item) => item.source.includes(needle))
    return locale === 'en' ? entry.source : entry.target
  }
  return {
    a_small_starter_with_room_to: pick('A small starter'),
    only_used_by_dead_code: pick('must never reach'),
  }
}

const checks = []
const expect = (name, pass, detail = '') => checks.push({ name, pass, detail })

// ---------- mode B: per-locale build ----------
for (const locale of LOCALES) {
  const code = await bundle(`static-${locale}`, locale)
  const other = locale === 'en' ? 'zh' : 'en'
  const own = textsFor(locale)
  const foreign = textsFor(other)

  expect(
    `[B:${locale}] 含本语言文案`,
    code.includes(own.a_small_starter_with_room_to),
  )
  expect(
    `[B:${locale}] 不含另一语言文案`,
    !code.includes(foreign.a_small_starter_with_room_to),
  )
  expect(`[B:${locale}] 无 getLocale 调用`, !code.includes('getLocale'))
  expect(
    `[B:${locale}] 无 AsyncLocalStorage`,
    !code.includes('AsyncLocalStorage'),
  )
  expect(
    `[B:${locale}] 未用导出被摇掉`,
    !code.includes(own.only_used_by_dead_code),
  )
  expect(`[B:${locale}] 插值保留`, /你好 \$\{|Hi \$\{/.test(code))
}

// ---------- mode A: single build ----------
{
  const code = await bundle('single', undefined)
  const en = textsFor('en')
  const zh = textsFor('zh')

  expect(
    '[A] 两种语言都在',
    code.includes(en.a_small_starter_with_room_to) &&
      code.includes(zh.a_small_starter_with_room_to),
  )
  expect('[A] 有 getLocale 调用', code.includes('getLocale'))
  expect('[A] 三元链而非对象字面量', !/\{\s*en:\s*[`"']/.test(code))
  expect('[A] 无 IIFE/箭头包装', !/\(\(\)\s*=>/.test(code))
  expect(
    '[A] 未用导出被摇掉(两语言都不在)',
    !code.includes(en.only_used_by_dead_code) &&
      !code.includes(zh.only_used_by_dead_code),
  )
}

let failed = 0
for (const c of checks) {
  process.stdout.write(
    `  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  ${c.detail}` : ''}\n`,
  )
  if (!c.pass) failed++
}
process.stdout.write(`\n  ${checks.length - failed}/${checks.length} 通过\n`)
process.exitCode = failed === 0 ? 0 : 1
