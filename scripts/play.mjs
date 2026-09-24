// Runs one playground, so the root package.json does not carry a `dev:` and a
// `build:` alias per app.
//
//   pnpm play                 # pick from the list, then `dev`
//   pnpm play nextjs          # `dev` in playground/nextjs
//   pnpm play nextjs build    # any script that playground defines
//   pnpm play solid           # a partial name narrows the list, then picks
//
// The playgrounds consume the built package, so `pnpm build` comes first.
import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { cancel, isCancel, select } from '@clack/prompts'

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)))
const dir = path.join(root, 'playground')

const playgrounds = readdirSync(dir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    name: entry.name,
    manifest: path.join(dir, entry.name, 'package.json'),
  }))
  .filter((entry) => existsSync(entry.manifest))
  .map(({ name, manifest }) => {
    // The directory name is what you type; the package name (`playground-nuxt`)
    // is pnpm's business, not the argument's.
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
    return { name, description: pkg.description, scripts: pkg.scripts ?? {} }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

const [query, script = 'dev'] = process.argv.slice(2)

// An exact name wins over the substring it is a prefix of: `solid-start` runs,
// where `solid` offers the three that contain it.
const exact = playgrounds.find((entry) => entry.name === query)
const matches =
  query === undefined
    ? playgrounds
    : exact
      ? [exact]
      : playgrounds.filter((entry) => entry.name.includes(query))

if (matches.length === 0) {
  fail(
    `No playground matches '${query}'.`,
    playgrounds.map((entry) => entry.name),
  )
}

const playground = matches.length === 1 ? matches[0] : await choose(matches)

if (!(script in playground.scripts)) {
  fail(
    `playground/${playground.name} has no '${script}' script.`,
    Object.keys(playground.scripts),
  )
}

const child = spawn('pnpm', [script], {
  cwd: path.join(dir, playground.name),
  stdio: 'inherit',
})
child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0))
})

// Each playground's package.json description is the hint, so the list explains
// itself the way the README table does.
async function choose(options) {
  if (!process.stdin.isTTY) {
    fail(
      'Name a playground - stdin is not a terminal, so there is nobody to ask.',
      options.map((entry) => entry.name),
    )
  }

  const answer = await select({
    message: `Which playground? (\`${script}\`)`,
    options: options.map((entry) => ({
      value: entry.name,
      label: entry.name,
      hint: entry.description,
    })),
  })

  if (isCancel(answer)) {
    cancel('Nothing to run.')
    process.exit(130)
  }

  return options.find((entry) => entry.name === answer)
}

function fail(message, options) {
  process.stderr.write(`${message}\n`)
  for (const option of options) process.stderr.write(`  ${option}\n`)
  process.exit(1)
}
