// Weighs the JavaScript each playground ships, so the comparisons in the
// READMEs are reproducible rather than remembered.
//
//   node scripts/bench-size.mjs
//   node scripts/bench-size.mjs --family SvelteKit,SolidStart   # a subset
//   node scripts/bench-size.mjs --compare                       # deltas vs the baseline
//   node scripts/bench-size.mjs --write                         # record a new baseline
//
// The baseline is `scripts/bench-baseline.json`, committed. Git is the history:
// the diff on that file is what a change costs, next to the change itself. A
// run that moves the numbers on purpose updates it in the same commit, so the
// file reviews itself and cannot silently go stale.
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
//            Nuxt builds through `nuxt build` and is measured under _nuxt.
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
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
  {
    family: 'Nuxt 4',
    label: 'best-i18n',
    dir: 'playground/nuxt',
    kind: 'nuxt',
    clientDir: '.output/public/_nuxt',
    env: {},
  },
  {
    family: 'Nuxt 4',
    label: 'best-i18n (staticLocale=zh)',
    dir: 'playground/nuxt',
    kind: 'nuxt',
    clientDir: '.output/public/_nuxt',
    env: { I18N_STATIC_LOCALE: 'zh' },
  },
  {
    family: 'Nuxt 4',
    label: '@nuxtjs/i18n',
    dir: 'playground/nuxt-i18n',
    kind: 'nuxt',
    clientDir: '.output/public/_nuxt',
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

const BASELINE = path.join(root, 'scripts', 'bench-baseline.json')
const compare = process.argv.includes('--compare')
const write = process.argv.includes('--write')

// The packages a row's numbers actually depend on, recorded beside the bytes:
// renovate automerges framework upgrades, so without them a jump gets blamed on
// a commit here rather than on the upgrade that caused it.
const FRAMEWORK = {
  'Next.js': 'next',
  'TanStack Start': '@tanstack/react-start',
  'SvelteKit': '@sveltejs/kit',
  'SolidStart v2': '@solidjs/start',
  'Nuxt 4': 'nuxt',
}
const LIBRARY = {
  'next-intl': 'next-intl',
  'paraglide': '@inlang/paraglide-js',
  'svelte-i18n': 'svelte-i18n',
  '@solid-primitives/i18n': '@solid-primitives/i18n',
  '@nuxtjs/i18n': '@nuxtjs/i18n',
}

// `family / label`: labels repeat across families, and a stable string key keeps
// the baseline's diff readable where an array's would reorder.
const keyOf = (variant) => `${variant.family} / ${variant.label}`

function versionsOf(variant, cwd) {
  // A label with no entry in LIBRARY is one of ours, and pnpm links the
  // workspace package into the playground like any other dependency.
  const names = [
    FRAMEWORK[variant.family],
    LIBRARY[variant.label] ?? 'best-i18n',
  ]
  const entries = []
  for (const name of names.filter(Boolean)) {
    try {
      const manifest = path.join(cwd, 'node_modules', name, 'package.json')
      entries.push([name, JSON.parse(readFileSync(manifest, 'utf8')).version])
    } catch {
      // Not installed for this playground - the row simply does not record it.
    }
  }
  return Object.fromEntries(entries)
}

function readBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE, 'utf8'))
  } catch {
    return { variants: {} }
  }
}

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

  const versions = versionsOf(variant, cwd)

  if (variant.kind === 'next') {
    await run('pnpm', ['exec', 'next', 'build'], { cwd, env })

    const server = await serve(cwd, variant.env)
    try {
      results.push({
        ...variant,
        versions,
        ...(await measureNext(cwd, server.origin)),
      })
    } finally {
      await server.stop()
    }
  } else {
    // Nuxt drives Vite itself; the emitted client assets are measured alike.
    const command =
      variant.kind === 'nuxt' ? ['nuxt', 'build'] : ['vite', 'build']
    await run('pnpm', ['exec', ...command], { cwd, env })
    results.push({
      ...variant,
      versions,
      ...measureVite(cwd, variant.clientDir),
    })
  }
}

const baseline = compare || write ? readBaseline() : undefined

// Rounding a difference to `kb()` turns the few bytes two runs of the same
// build differ by into `-0.0 kB`, which reads like a measurement rather than
// like noise. Under a kilobyte the exact bytes say what it is.
function delta(now, before) {
  if (before === undefined) return 'new'

  const diff = now - before
  if (diff === 0) return '='

  const sign = diff > 0 ? '+' : ''
  const size = Math.abs(diff) < 1024 ? `${sign}${diff} B` : `${sign}${kb(diff)}`
  return `${size} (${sign}${((diff / before) * 100).toFixed(1)}%)`
}

for (const family of new Set(results.map((r) => r.family))) {
  const rows = results.filter((result) => result.family === family)
  const withHtml = rows.some((row) => row.pages.length > 0)

  const htmlColumns = ['/zh', '/zh/long']

  process.stdout.write(`\n### ${family}\n\n`)
  process.stdout.write(
    `| variant | client JS (gzip) |${compare ? ' vs baseline |' : ''}` +
      ` client JS (raw) |${
        withHtml ? htmlColumns.map((p) => ` HTML ${p} (gzip) |`).join('') : ''
      }\n`,
  )
  process.stdout.write(
    `| --- | --- |${compare ? ' --- |' : ''} --- |${
      withHtml ? ' --- |'.repeat(htmlColumns.length) : ''
    }\n`,
  )

  for (const row of rows) {
    const cells = htmlColumns.map((wanted) => {
      const page = row.pages.find((p) => p.page === wanted)
      return ` ${page === undefined ? '-' : kb(page.htmlGzip)} |`
    })
    const was = baseline?.variants[keyOf(row)]
    process.stdout.write(
      `| ${row.label} | ${kb(row.gzip)} |` +
        `${compare ? ` ${delta(row.gzip, was?.gzip)} |` : ''}` +
        ` ${kb(row.raw)} |${withHtml ? cells.join('') : ''}\n`,
    )
  }
}

if (write) {
  // Merge, never replace: `--family` measures a subset, and the rows it did not
  // build are still true.
  const variants = { ...baseline.variants }
  for (const row of results) {
    variants[keyOf(row)] = {
      dir: row.dir,
      versions: row.versions,
      gzip: row.gzip,
      raw: row.raw,
      files: row.files,
      // Only the Next rows serve HTML to weigh; the others would write `{}`.
      ...(row.pages.length > 0 && {
        pages: Object.fromEntries(row.pages.map((p) => [p.page, p.htmlGzip])),
      }),
    }
  }

  const sorted = Object.fromEntries(
    Object.keys(variants)
      .sort()
      .map((key) => [key, variants[key]]),
  )
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ recordedAt: new Date().toISOString().slice(0, 10), node: process.version, variants: sorted }, null, 2)}\n`,
  )
  process.stdout.write(`\nwrote ${path.relative(root, BASELINE)}\n`)
}

// `fetch` leaves keep-alive sockets open, which keeps the process alive long
// after the last table is printed.
process.exit(0)
