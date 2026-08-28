// Builds each playground, serves it, and sums the JavaScript a browser
// actually downloads for a page - resolved from the HTML back to files on
// disk, so the number is what ships rather than what a report claims.
//
//   node scripts/bench-size.mjs
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)))

const PAGES = ['/zh', '/zh/about']

const VARIANTS = [
  {
    label: 'best-i18n',
    dir: 'playground/nextjs',
    env: {},
  },
  {
    label: 'best-i18n (staticLocale=zh)',
    dir: 'playground/nextjs',
    env: { I18N_STATIC_LOCALE: 'zh' },
  },
  {
    label: 'next-intl',
    dir: 'playground/nextjs-intl',
    env: {},
  },
]

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    )
  })
}

async function serve(cwd, port, env) {
  const child = spawn(
    'pnpm',
    ['exec', 'next', 'start', '--port', String(port)],
    {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'ignore',
    },
  )

  // `next start` is ready when it answers, not when it says it is.
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await fetch(`http://localhost:${port}/`)
      return child
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  child.kill()
  throw new Error(`server on ${port} never came up`)
}

async function measure(baseUrl, nextDir) {
  const scripts = new Set()
  const pages = []

  for (const page of PAGES) {
    const html = await (await fetch(baseUrl + page)).text()
    pages.push({
      page,
      html: Buffer.byteLength(html),
      htmlGzip: gzipSync(Buffer.from(html)).length,
    })
    for (const match of html.matchAll(/\/_next\/static\/[^"'\\\s)]+?\.js/g)) {
      scripts.add(match[0])
    }
  }

  let raw = 0
  let gzip = 0

  for (const url of scripts) {
    const file = path.join(nextDir, 'static', url.replace('/_next/static/', ''))
    const bytes = readFileSync(file)
    raw += bytes.length
    gzip += gzipSync(bytes).length
  }

  return { files: scripts.size, raw, gzip, pages }
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`
const results = []

for (const [index, variant] of VARIANTS.entries()) {
  const cwd = path.join(root, variant.dir)
  const port = 3200 + index

  process.stdout.write(`\nbuilding ${variant.label}\n`)
  await run('pnpm', ['exec', 'next', 'build'], {
    cwd,
    env: { ...process.env, ...variant.env },
  })

  const server = await serve(cwd, port, variant.env)
  try {
    results.push({
      label: variant.label,
      ...(await measure(`http://localhost:${port}`, path.join(cwd, '.next'))),
    })
  } finally {
    server.kill()
  }
}

process.stdout.write(
  `\n| variant | client JS (gzip) | client JS (raw) | HTML /zh (gzip) |\n`,
)
process.stdout.write(`| --- | --- | --- | --- |\n`)
for (const result of results) {
  const home = result.pages.find((page) => page.page === '/zh')
  process.stdout.write(
    `| ${result.label} | ${kb(result.gzip)} | ${kb(result.raw)} | ${kb(home.htmlGzip)} |\n`,
  )
}
