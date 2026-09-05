import { describe, expect, it } from 'vitest'

import { transform } from '../src/compiler/transform.ts'
import { fixture, json } from './helpers/fixture.ts'

const REACT = 'best-i18n/react/macro'

const options = (catalog: Record<string, Record<string, string>> = {}) => ({
  locales: ['en', 'zh'],
  baseLocale: 'en',
  catalog,
})

describe('parsing JSX in plain JavaScript files', () => {
  const code = [
    `import { Trans } from '${REACT}'`,
    'export const a = <p><Trans>About</Trans></p>',
  ].join('\n')

  it.each(['a.js', 'a.mjs', 'a.cjs', 'a.jsx'])('parses %s', (filename) => {
    const result = transform(
      code,
      filename,
      options({ About: { zh: '关于' } }),
    )!

    expect(result.code).toContain('关于')
  })
})

describe('t template whitespace', () => {
  it('collapses a source line break to one space', async () => {
    // Re-indenting a component must not change the msgid.
    const result = transform(
      fixture('transform-edges/whitespace-linebreak/input.ts'),
      'a.ts',
      options(),
    )!

    await expect(json(result.messages[0])).toMatchFileSnapshot(
      'fixtures/transform-edges/whitespace-linebreak/messages.json',
    )
  })

  it('keeps a written \\n escape', async () => {
    const result = transform(
      fixture('transform-edges/whitespace-written-escape/input.ts'),
      'a.ts',
      options(),
    )!

    await expect(json(result.messages[0])).toMatchFileSnapshot(
      'fixtures/transform-edges/whitespace-written-escape/messages.json',
    )
  })
})

describe('<Trans> entities', () => {
  it('decodes entities the way JSX renders them', async () => {
    const result = transform(
      fixture('transform-edges/entities-decoded/input.tsx'),
      'a.tsx',
      options(),
    )!

    // The translator sees the real text, and the emitted literal renders it.
    await expect(json(result.messages[0])).toMatchFileSnapshot(
      'fixtures/transform-edges/entities-decoded/messages.json',
    )
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/transform-edges/entities-decoded/output.tsx',
    )
  })

  it('leaves an unknown entity untouched', async () => {
    const result = transform(
      fixture('transform-edges/entities-unknown/input.tsx'),
      'a.tsx',
      options(),
    )!

    await expect(json(result.messages[0])).toMatchFileSnapshot(
      'fixtures/transform-edges/entities-unknown/messages.json',
    )
  })
})

describe('<Trans> expression children', () => {
  it('keeps a lone expression an expression, not a string', async () => {
    const result = transform(
      fixture('transform-edges/lone-expression/input.tsx'),
      'a.tsx',
      options(),
    )!

    // `` {`${name}`} `` would render a ReactNode as [object Object] and null
    // as the word "null".
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/transform-edges/lone-expression/output.tsx',
    )
  })

  it('still concatenates a mixed text-and-expression run', () => {
    const code = [
      `import { Trans } from '${REACT}'`,
      'export const a = <p><Trans>Hi {name}!</Trans></p>',
    ].join('\n')

    const result = transform(code, 'a.tsx', options())!

    expect(result.code).toContain('`Hi ${name}!`')
  })
})
