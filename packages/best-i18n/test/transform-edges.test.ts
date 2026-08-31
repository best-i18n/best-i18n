import { describe, expect, it } from 'vitest'

import { transform } from '../src/compiler/transform.ts'

const MACRO = 'best-i18n/macro'
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
  it('collapses a source line break to one space', () => {
    // Re-indenting a component must not change the msgid.
    const result = transform(
      `import { t } from '${MACRO}'\nconst a = t\`line one\n      line two\``,
      'a.ts',
      options(),
    )!

    expect(result.messages[0]!.text).toBe('line one line two')
  })

  it('keeps a written \\n escape', () => {
    const result = transform(
      `import { t } from '${MACRO}'\nconst a = t\`line one\\nline two\``,
      'a.ts',
      options(),
    )!

    expect(result.messages[0]!.text).toBe('line one\nline two')
  })
})

describe('<Trans> entities', () => {
  it('decodes entities the way JSX renders them', () => {
    const code = [
      `import { Trans } from '${REACT}'`,
      'export const a = <p><Trans>Tom &amp; Jerry&hellip; &#169; &#x2122;</Trans></p>',
    ].join('\n')

    const result = transform(code, 'a.tsx', options())!

    // The translator sees the real text, and the emitted literal renders it.
    expect(result.messages[0]!.text).toBe('Tom & Jerry… © ™')
    expect(result.code).toContain('Tom & Jerry… © ™')
  })

  it('leaves an unknown entity untouched', () => {
    const code = [
      `import { Trans } from '${REACT}'`,
      'export const a = <p><Trans>a &notreal; b</Trans></p>',
    ].join('\n')

    const result = transform(code, 'a.tsx', options())!

    expect(result.messages[0]!.text).toBe('a &notreal; b')
  })
})

describe('<Trans> expression children', () => {
  it('keeps a lone expression an expression, not a string', () => {
    const code = [
      `import { Trans } from '${REACT}'`,
      'export const a = <p><Trans>Hi <b>{name}</b>!</Trans></p>',
    ].join('\n')

    const result = transform(code, 'a.tsx', options())!

    // `` {`${name}`} `` would render a ReactNode as [object Object] and null
    // as the word "null".
    expect(result.code).toContain('<b>{(name)}</b>')
    expect(result.code).not.toContain('${name}')
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
