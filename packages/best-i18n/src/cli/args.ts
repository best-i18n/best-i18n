import process from 'node:process'
import { cac } from 'cac'
import type { Command } from 'cac'

/**
 * What the two commands share: one cac instance with a default command, a
 * help screen led by a short explanation, and errors that read the same
 * whether cac or the command found them.
 *
 * Returns the parsed options, or never returns: `--help` prints and exits 0,
 * a bad invocation prints `<name>: <why>` and exits 1.
 */
export function parseCli<Options>(
  name: string,
  summary: string,
  explanation: string,
  define: (command: Command) => Command,
): Options {
  const cli = cac(name)
  let options: Options | undefined

  define(cli.command('', summary)).action((parsed: Options) => {
    options = parsed
  })

  // cac lays the screen out for a multi-command tool. This is a single
  // command, so: name and summary on the first line, a usage line with the
  // one required option, the explanation, then the options - and none of the
  // command listing or the "run any command with --help" hint.
  cli.help((sections) => {
    const options = sections.find((section) => section.title === 'Options')
    return [
      { body: `${name} - ${summary}` },
      { title: 'Usage', body: `  $ ${name} --locales en,zh [options]` },
      { body: explanation },
      ...(options === undefined ? [] : [options]),
    ]
  })

  try {
    cli.parse()
  } catch (error) {
    if (error instanceof Error && error.name === 'CACError') {
      fail(name, error.message)
    }
    throw error
  }

  if (options === undefined) process.exit(0)
  return options
}

export function fail(name: string, message: string): never {
  process.stderr.write(`${name}: ${message}\n`)
  process.exit(1)
}
