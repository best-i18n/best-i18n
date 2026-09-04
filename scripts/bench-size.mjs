// Weighs the JavaScript each playground ships, so the comparisons in the
// READMEs are reproducible rather than remembered.
//
//   node scripts/bench-size.mjs
//
// Two families, two methods - both apps in a family are measured identically,
// which is what makes the comparison within a table mean something:
//
//   next     serve the build and add up every /_next/static/*.js the HTML of
//            /zh and /zh/about references, resolved back to files on disk.
//   vite     add up the emitted client assets. TanStack Start hands the client
//            entry to the browser through a manifest rather than a script tag,
//            so there is no href to follow; both apps split into the same three
//            chunks, so the totals line up anyway.
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)))

const PAGES = ['/zh', '/zh/about', '/zh/long']

const VARIANTS = [
  {
    family: 'Next.js',
    label: 'best-i18n',
    dir: 'playground/nextjs',
    kind: 'next',
    env: {},
  },
  {
    family: 'Next.js',
    label: 'best-i18n (staticLocale=zh)',
    dir: 'playground/nextjs',
    kind: 'next',
    env: { I18N_STATIC_LOCALE: 'zh' },
  },
  {
    family: 'Next.js',
    label: 'next-intl',
    dir: 'playground/nextjs-intl',
    kind: 'next',
    env: {},
  },
  {
    family: 'TanStack Start',
    label: 'best-i18n',
    dir: 'playground/tanstack-start',
    kind: 'vite',
    env: {},
  },
  {
    family: 'TanStack Start',
    label: 'best-i18n (staticLocale=zh)',
    dir: 'playground/tanstack-start',
    kind: 'vite',
    env: { I18N_STATIC_LOCALE: 'zh' },
  },
  {
    family: 'TanStack Start',
    label: 'paraglide',
    dir: 'playground/tanstack-start-paraglide',
    kind: 'vite',
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
    { cwd, env: { ...process.env, ...env }, stdio: 'ignore' },
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

function weigh(files) {
  let raw = 0
  let gzip = 0

  for (const file of files) {
    const bytes = readFileSync(file)
    raw += bytes.length
    gzip += gzipSync(bytes).length
  }

  return { files: files.length, raw, gzip }
}

async function measureNext(cwd, port) {
  const referenced = new Set()
  const pages = []

  for (const page of PAGES) {
    const html = await (await fetch(`http://localhost:${port}${page}`)).text()
    pages.push({
      page,
      html: Buffer.byteLength(html),
      htmlGzip: gzipSync(Buffer.from(html)).length,
    })
    for (const match of html.matchAll(/\/_next\/static\/[^"'\\\s)]+?\.js/g)) {
      referenced.add(match[0])
    }
  }

  const files = [...referenced].map((url) =>
    path.join(cwd, '.next/static', url.replace('/_next/static/', '')),
  )

  return { ...weigh(files), pages }
}

function measureVite(cwd) {
  const assets = path.join(cwd, '.output/public/assets')
  const files = readdirSync(assets)
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join(assets, name))

  return { ...weigh(files), pages: [] }
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`
const results = []

for (const [index, variant] of VARIANTS.entries()) {
  const cwd = path.join(root, variant.dir)
  const env = { ...process.env, ...variant.env }

  process.stdout.write(`\nbuilding ${variant.family} / ${variant.label}\n`)

  if (variant.kind === 'next') {
    await run('pnpm', ['exec', 'next', 'build'], { cwd, env })

    const server = await serve(cwd, 3200 + index, variant.env)
    try {
      results.push({ ...variant, ...(await measureNext(cwd, 3200 + index)) })
    } finally {
      server.kill()
    }
  } else {
    await run('pnpm', ['exec', 'vite', 'build'], { cwd, env })
    results.push({ ...variant, ...measureVite(cwd) })
  }
}

for (const family of [...new Set(results.map((r) => r.family))]) {
  const rows = results.filter((result) => result.family === family)
  const withHtml = rows.some((row) => row.pages.length > 0)

  const htmlColumns = ['/zh', '/zh/long']

  process.stdout.write(`\n### ${family}\n\n`)
  process.stdout.write(
    `| variant | client JS (gzip) | client JS (raw) |${
      withHtml ? htmlColumns.map((p) => ` HTML ${p} (gzip) |`).join('') : ''
    }\n`,
  )
  process.stdout.write(
    `| --- | --- | --- |${withHtml ? ' --- |'.repeat(htmlColumns.length) : ''}\n`,
  )

  for (const row of rows) {
    const cells = htmlColumns.map((wanted) => {
      const page = row.pages.find((p) => p.page === wanted)
      return ` ${page === undefined ? '-' : kb(page.htmlGzip)} |`
    })
    process.stdout.write(
      `| ${row.label} | ${kb(row.gzip)} | ${kb(row.raw)} |` +
        `${withHtml ? cells.join('') : ''}\n`,
    )
  }
}

// `fetch` leaves keep-alive sockets open, which keeps the process alive long
// after the last table is printed.
process.exit(0)
