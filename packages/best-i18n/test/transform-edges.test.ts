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

/**
 * Cases borrowed from Lingui's macro test suite, whose `<Trans>` and `t`
 * semantics this compiler inherited along with the `<0>...</0>` convention.
 * Every one of these already held; none of them was pinned, and each is the
 * kind of thing that breaks silently - a msgid that shifts under a reformat
 * orphans every translation of it.
 */
describe('macro semantics inherited from Lingui', () => {
  const macro = 'best-i18n/macro'

  /** The one message a snippet extracts. */
  const only = (code: string, filename = 'a.tsx') => {
    const source = [
      `import { t } from '${macro}'`,
      `import { Trans } from '${REACT}'`,
      code,
    ].join('\n')

    return transform(source, filename, options())!.messages[0]!
  }

  describe('the msgid does not depend on the line endings', () => {
    // A checkout with `core.autocrlf`, or one editor among many, must not
    // rewrite every msgid in the catalog.
    it.each([
      ['LF', '\n'],
      ['CRLF', '\r\n'],
      ['CR', '\r'],
    ])('t`` under %s', (_name, eol) => {
      expect(only(`export const a = t\`hello${eol}world\``).text).toBe(
        'hello world',
      )
    })

    it.each([
      ['LF', '\n'],
      ['CRLF', '\r\n'],
      ['CR', '\r'],
    ])('<Trans> under %s', (_name, eol) => {
      expect(
        only(`export const a = <Trans>hello${eol}  world</Trans>`).text,
      ).toBe('hello world')
    })
  })

  it('drops the newline after a continuation character', () => {
    // `t\`a \<newline>b\`` is one line of text as far as JavaScript is
    // concerned, and has to be one line of text in the catalog too.
    expect(only('export const a = t`hello \\\n  world`').text).toBe(
      'hello   world',
    )
  })

  describe('JSX comments', () => {
    it('are not part of the message', () => {
      expect(
        only('export const a = <Trans>Hi {/* who? */}{name}!</Trans>'),
      ).toMatchObject({ text: 'Hi {name}!', placeholders: ['name'] })
    })

    it('do not shift the numbering of positional placeholders', () => {
      // An empty expression container that consumed an index would renumber
      // every placeholder after it, against a catalog that still says {0}.
      expect(
        only('export const a = <Trans>{/* c */}{f()} then {g()}</Trans>'),
      ).toMatchObject({ text: '{0} then {1}', expressions: ['f()', 'g()'] })
    })
  })

  describe('numeric character references', () => {
    it.each([
      ['decimal', '&#65;'],
      ['hexadecimal', '&#x41;'],
    ])('%s', (_name, entity) => {
      expect(only(`export const a = <Trans>a${entity}b</Trans>`).text).toBe(
        'aAb',
      )
    })
  })

  describe('a repeated expression is one placeholder', () => {
    it('in t``', () => {
      expect(only('export const a = t`${name} and ${name}`')).toMatchObject({
        text: '{name} and {name}',
        expressions: ['name'],
      })
    })

    it('in <Trans>', () => {
      expect(
        only('export const a = <Trans>{name} and {name}</Trans>'),
      ).toMatchObject({ text: '{name} and {name}', expressions: ['name'] })
    })

    it('by expression, not by name, for a positional one', () => {
      expect(
        only('export const a = t`${user.name} vs ${user.name}`'),
      ).toMatchObject({ text: '{0} vs {0}', expressions: ['user.name'] })
    })
  })

  describe('attributes on markup inside <Trans>', () => {
    it('stay out of the message and at the call site', () => {
      const source = [
        `import { Trans } from '${REACT}'`,
        'export const a = <Trans>Click <a href="/x" title="Go">here</a></Trans>',
      ].join('\n')

      const result = transform(source, 'a.tsx', options())!

      // A translator must not be able to retarget a link, and must not have
      // to carry the attributes through to keep one.
      expect(result.messages[0]!.text).toBe('Click <a>here</a>')
      expect(result.code).toContain('href="/x"')
      expect(result.code).toContain('title="Go"')
    })

    it('survive a spread', () => {
      const source = [
        `import { Trans } from '${REACT}'`,
        'export const a = <Trans>Click <a {...props}>here</a></Trans>',
      ].join('\n')

      const result = transform(source, 'a.tsx', options())!

      expect(result.messages[0]!.text).toBe('Click <a>here</a>')
      expect(result.code).toContain('{...props}')
    })
  })

  it('finds a <Trans> in every branch of a nested conditional', () => {
    const source = [
      `import { Trans } from '${REACT}'`,
      'export const a = (',
      '  <p>{x ? <Trans>Yes</Trans> : y ? <Trans>No</Trans> : <Trans>Maybe</Trans>}</p>',
      ')',
    ].join('\n')

    const messages = transform(source, 'a.tsx', options())!.messages

    expect(messages.map((message) => message.text)).toEqual([
      'Yes',
      'No',
      'Maybe',
    ])
  })

  it('extracts a t`` used as a JSX attribute value', () => {
    expect(only('export const a = <img alt={t`Logo`} />').text).toBe('Logo')
  })
})

describe('where this compiler diverges from Lingui on purpose', () => {
  it('treats a string literal child as an expression, not as text', () => {
    // Lingui reads `<Trans>{"hello"}</Trans>` as the message "hello". Here a
    // lone expression container stays an expression whatever is inside it -
    // the rule that keeps `{node}` from rendering as [object Object] - so the
    // msgid is `{0}` and there is no text in it to translate. Worth writing
    // as `<Trans>hello</Trans>`; pinned so the difference is a decision
    // rather than a surprise.
    const source = [
      `import { Trans } from '${REACT}'`,
      'export const a = <Trans>{"hello"}</Trans>',
    ].join('\n')

    expect(transform(source, 'a.tsx', options())!.messages[0]).toMatchObject({
      text: '{0}',
      expressions: ['"hello"'],
    })
  })
})
