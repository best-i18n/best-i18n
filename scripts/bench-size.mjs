// Weighs the JavaScript each playground ships, so the comparisons in the
// READMEs are reproducible rather than remembered.
//
//   node scripts/bench-size.mjs
//   node scripts/bench-size.mjs --family SvelteKit,SolidStart   # a subset
//
// Framework families, two methods - variants in a family are measured identically,
// which is what makes the comparison within a table mean something:
//
//   next     serve the build and add up every /_next/static/*.js the HTML of
//            /zh, /zh/about and /zh/long reference, resolved to files on disk.
//   vite     add up the emitted client assets. TanStack Start hands the client
//            entry to the browser through a manifest rather than a script tag,
//            so there is no href to follow; both apps split into the same three
//            chunks, so the totals line up anyway. SvelteKit is reported in its
//            own table and includes all client chunks, entries and route nodes.
//            SolidStart v2 also gets its own table, covering all _build JS.
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
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
  {
    family: 'SvelteKit',
    label: 'best-i18n',
    dir: 'playground/sveltekit',
    kind: 'vite',
    clientDir: '.svelte-kit/output/client',
    env: {},
  },
  {
    family: 'SvelteKit',
    label: 'best-i18n (staticLocale=zh)',
    dir: 'playground/sveltekit',
    kind: 'vite',
    clientDir: '.svelte-kit/output/client',
    env: { I18N_STATIC_LOCALE: 'zh' },
  },
  {
    family: 'SvelteKit',
    label: 'paraglide',
    dir: 'playground/sveltekit-paraglide',
    kind: 'vite',
    clientDir: '.svelte-kit/output/client',
    env: {},
  },
  {
    family: 'SvelteKit',
    label: 'svelte-i18n',
    dir: 'playground/sveltekit-svelte-i18n',
    kind: 'vite',
    clientDir: '.svelte-kit/output/client',
    env: {},
  },
  {
    family: 'SolidStart v2',
    label: 'best-i18n',
    dir: 'playground/solid-start',
    kind: 'vite',
    clientDir: '.output/public/_build',
    env: {},
  },
  {
    family: 'SolidStart v2',
    label: 'best-i18n (staticLocale=zh)',
    dir: 'playground/solid-start',
    kind: 'vite',
    clientDir: '.output/public/_build',
    env: { I18N_STATIC_LOCALE: 'zh' },
  },
  {
    family: 'SolidStart v2',
    label: 'paraglide',
    dir: 'playground/solid-start-paraglide',
    kind: 'vite',
    clientDir: '.output/public/_build',
    env: {},
  },
  {
    family: 'SolidStart v2',
    label: '@solid-primitives/i18n',
    dir: 'playground/solid-start-primitives',
    kind: 'vite',
    clientDir: '.output/public/_build',
    env: {},
  },
]

// `--family A,B` limits the run to those tables; matching ignores case and
// anything after the first word, so `solidstart` finds "SolidStart v2". An
// unknown name is an error, not an empty run that exits 0.
const normalize = (name) => name.toLowerCase().replace(/[^a-z]/g, '')
const familyKeys = (family) =>
  new Set([normalize(family), normalize(family.split(' ')[0])])
const familyArg = process.argv.indexOf('--family')
const wanted =
  familyArg === -1
    ? undefined
    : (process.argv[familyArg + 1] ?? '')
        .split(',')
        .map((name) => normalize(name.trim()))
        .filter(Boolean)
if (wanted !== undefined) {
  const known = new Set(VARIANTS.flatMap((v) => [...familyKeys(v.family)]))
  const unknown = wanted.filter((name) => !known.has(name))
  if (wanted.length === 0 || unknown.length > 0) {
    const families = [...new Set(VARIANTS.map((v) => v.family))].join(', ')
    process.stderr.write(
      `bench-size: unknown --family ${unknown.map((n) => JSON.stringify(n)).join(', ') || '(empty)'}. ` +
        `Known families: ${families}\n`,
    )
    process.exit(1)
  }
}
const selected = VARIANTS.filter(
  (variant) =>
    wanted === undefined ||
    wanted.some((name) => familyKeys(variant.family).has(name)),
)

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    )
  })
}

async function serve(cwd, env) {
  const require = createRequire(path.join(cwd, 'package.json'))
  // Own the actual server process, not a package-manager wrapper whose child
  // survives kill(). Port 0 lets the OS choose a port for this build alone.
  const child = spawn(
    process.execPath,
    [
      require.resolve('next/dist/bin/next'),
      'start',
      '--hostname',
      'localhost',
      '--port',
      '0',
    ],
    { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let output = ''
  let origin
  let spawnError
  let exited = false
  const closed = new Promise((resolve) => {
    child.once('error', (error) => {
      spawnError = error
    })
    child.once('close', () => {
      exited = true
      resolve()
    })
  })
  child.stdout.on('data', (chunk) => {
    output = (output + chunk.toString()).slice(-65536)
    // Next reports this URL only after its own listener has bound the port.
    origin ??= output.match(/http:\/\/localhost:\d+(?=\s)/)?.[0]
  })
  child.stderr.on('data', (chunk) => {
    output = (output + chunk.toString()).slice(-65536)
  })

  const stop = async () => {
    if (exited) return
    child.kill('SIGTERM')
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5000)
    try {
      await closed
    } finally {
      clearTimeout(timeout)
    }
  }

  try {
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError
      if (exited)
        throw new Error(
          `Next.js exited before becoming ready in ${cwd}:\n${output}`,
        )
      if (origin) {
        try {
          const response = await fetch(`${origin}/zh`, {
            signal: AbortSignal.timeout(2000),
          })
          await response.body?.cancel()
          if (response.ok && !exited) return { origin, stop }
        } catch {
          // A bound socket may precede the request handler being ready.
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    throw new Error(`Next.js never became ready in ${cwd}:\n${output}`)
  } catch (error) {
    await stop()
    throw error
  }
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

async function measureNext(cwd, origin) {
  const referenced = new Set()
  const pages = []

  for (const page of PAGES) {
    const response = await fetch(`${origin}${page}`, {
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok)
      throw new Error(`Cannot measure ${page}: HTTP ${response.status}`)
    const html = await response.text()
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

function measureVite(cwd, clientDir = '.output/public/assets') {
  const files = []
  const collect = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) collect(file)
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(file)
    }
  }
  collect(path.join(cwd, clientDir))

  return { ...weigh(files), pages: [] }
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`
const results = []

for (const variant of selected) {
  const cwd = path.join(root, variant.dir)
  const env = { ...process.env, ...variant.env }

  process.stdout.write(`\nbuilding ${variant.family} / ${variant.label}\n`)

  if (variant.kind === 'next') {
    await run('pnpm', ['exec', 'next', 'build'], { cwd, env })

    const server = await serve(cwd, variant.env)
    try {
      results.push({ ...variant, ...(await measureNext(cwd, server.origin)) })
    } finally {
      await server.stop()
    }
  } else {
    await run('pnpm', ['exec', 'vite', 'build'], { cwd, env })
    results.push({ ...variant, ...measureVite(cwd, variant.clientDir) })
  }
}

for (const family of new Set(results.map((r) => r.family))) {
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
