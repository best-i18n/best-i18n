import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { readdirSync, readFileSync } from 'node:fs'
// oxlint-disable-next-line vitest/no-import-node-test -- Standalone production tests run with node --test.
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('../', import.meta.url))

for (const staticLocale of ['', 'en', 'zh']) {
  test(
    `SolidStart production: ${staticLocale || 'dynamic'}`,
    { timeout: 120_000 },
    async () => {
      execFileSync('pnpm', ['build'], {
        cwd,
        env: { ...process.env, I18N_STATIC_LOCALE: staticLocale },
        stdio: 'pipe',
        timeout: 90_000,
      })
      const server = spawn(process.execPath, ['.output/server/index.mjs'], {
        cwd,
        env: { ...process.env, PORT: '0', HOST: '127.0.0.1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const exited = once(server, 'exit')
      try {
        const origin = await new Promise((resolve, reject) => {
          let output = ''
          const timer = setTimeout(
            () => reject(new Error(`Server startup timed out: ${output}`)),
            15_000,
          )
          const fail = (error) => {
            clearTimeout(timer)
            reject(error)
          }
          server.once('error', fail)
          server.once('exit', (code) =>
            fail(new Error(`Server exited: ${code}: ${output}`)),
          )
          server.stdout.on('data', (data) => {
            output += data
            const url = output.match(/http:\/\/[^\s]+/)
            if (url) {
              clearTimeout(timer)
              resolve(url[0].replace(/\/$/, ''))
            }
          })
          server.stderr.on('data', (data) => {
            output += data
          })
        })
        async function check(path, locale, headers = {}) {
          const response = await fetch(`${origin}${path}`, { headers })
          assert.equal(response.status, 200, path)
          const html = await response.text()
          const language = staticLocale || locale
          assert.ok(
            html.includes(`<html lang="${language}">`),
            `${path}: HTML language`,
          )
          assert.ok(
            html.includes(language === 'zh' ? '首页' : 'Home'),
            `${path}: navigation`,
          )
          assert.ok(
            html.includes(language === 'zh' ? '关于' : 'About'),
            `${path}: navigation`,
          )
          assert.ok(
            html.includes(
              path.endsWith('about')
                ? language === 'zh'
                  ? '翻译会编译到你的应用中。'
                  : 'Translations are compiled into your application.'
                : language === 'zh'
                  ? '0 次点击'
                  : '0 clicks',
            ),
            `${path}: body language`,
          )
          return html
        }
        await check('/', 'en')
        await check('/about', 'en')
        await check('/zh', 'zh')
        await check('/zh/about', 'zh')
        await check('/', 'zh', { cookie: 'LOCALE=zh' })
        await check('/', 'zh', { 'accept-language': 'zh-CN,zh;q=0.9' })
        await check('/', 'en', {
          'cookie': 'LOCALE=en',
          'accept-language': 'zh',
        })
        await check('/zh', 'zh', { cookie: 'LOCALE=en' })
        await Promise.all(
          Array.from({ length: 20 }, (_, index) =>
            check(index % 2 ? '/' : '/zh', index % 2 ? 'en' : 'zh'),
          ),
        )
        const html = await check('/zh', 'zh')
        const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
          (match) => match[1],
        )
        assert.ok(
          scripts.length > 0,
          'SSR must include client entry for hydration',
        )
        for (const src of scripts)
          assert.equal((await fetch(new URL(src, origin))).status, 200)
        const assets = `${cwd}/.output/public/_build/assets`
        const javascript = readdirSync(assets)
          .filter((name) => name.endsWith('.js'))
          .map((name) => readFileSync(`${assets}/${name}`, 'utf8'))
          .join('\n')
        assert.ok(
          !javascript.includes('node:async_hooks'),
          'server isolation must not enter client bundle',
        )
        if (staticLocale) {
          assert.ok(
            !javascript.includes(
              staticLocale === 'zh'
                ? 'Hello from SolidStart!'
                : '来自 SolidStart 的问候！',
            ),
            'other locale must be eliminated',
          )
        }
      } finally {
        server.kill('SIGTERM')
        const timer = setTimeout(() => server.kill('SIGKILL'), 5_000)
        await exited
        clearTimeout(timer)
      }
    },
  )
}
