import { describe, expect, it } from 'vitest'

import { extract, transform } from '../src/compiler/transform.ts'

const MACRO = 'best-i18n/macro'
const REACT = 'best-i18n/react/macro'

const src = (code: string) => `import { t } from '${MACRO}'\n${code}`

const OPTIONS = {
  locales: ['en', 'zh'],
  baseLocale: 'en',
  catalog: {
    'Open': { zh: '打开文件' },
    'verbOpen': { zh: '打开' },
    'adjectiveOpen': { zh: '营业中' },
  },
}

describe('t.ctx', () => {
  it('extracts the context alongside the text', () => {
    const messages = extract(
      src("const a = t.ctx('verb')`Open`\nconst b = t`Open`"),
      'a.ts',
    )

    expect(messages.map((message) => message.context)).toEqual(['verb', ''])
    expect(messages.map((message) => message.text)).toEqual(['Open', 'Open'])
  })

  it('translates each context separately', () => {
    const result = transform(
      src(
        [
          "export const verb = t.ctx('verb')`Open`",
          "export const adjective = t.ctx('adjective')`Open`",
          'export const plain = t`Open`',
        ].join('\n'),
      ),
      'a.ts',
      { ...OPTIONS, staticLocale: 'zh' },
    )!

    expect(result.code).toContain('`打开`')
    expect(result.code).toContain('`营业中`')
    expect(result.code).toContain('`打开文件`')
  })

  it('works on the hook variable', () => {
    const code = [
      `import { useI18n } from '${REACT}'`,
      'function A() {',
      '  const t = useI18n()',
      "  return t.ctx('verb')`Open`",
      '}',
    ].join('\n')

    const result = transform(code, 'a.tsx', OPTIONS)!

    expect(result.code).toContain('(t === "zh" ? `打开` : `Open`)')
  })

  it('rejects a dynamic context', () => {
    expect(() =>
      transform(src('const a = t.ctx(kind)`Open`'), 'a.ts', OPTIONS),
    ).toThrow(/statically visible/)
    expect(() =>
      transform(src("const a = t.ctx('')`Open`"), 'a.ts', OPTIONS),
    ).toThrow(/non-empty/)
  })

  it('leaves an unrelated .ctx() alone', () => {
    const result = transform(
      src("const a = t`Open`\nconst b = other.ctx('x')`y`"),
      'a.ts',
      { ...OPTIONS, staticLocale: 'zh' },
    )!

    expect(result.code).toContain("other.ctx('x')`y`")
  })
})

describe('<Trans ctx>', () => {
  it('extracts and translates by context', () => {
    const code = [
      `import { Trans } from '${REACT}'`,
      "export const a = <p><Trans ctx='verb'>Open</Trans></p>",
    ].join('\n')

    expect(extract(code, 'a.tsx')[0]).toMatchObject({
      text: 'Open',
      context: 'verb',
    })

    const result = transform(code, 'a.tsx', {
      ...OPTIONS,
      staticLocale: 'zh',
    })!
    expect(result.code).toContain('`打开`')
  })

  it('still rejects any other prop', () => {
    const code = [
      `import { Trans } from '${REACT}'`,
      "export const a = <p><Trans id='x'>Open</Trans></p>",
    ].join('\n')

    expect(() => transform(code, 'a.tsx', OPTIONS)).toThrow(/no props/)
  })

  it('rejects a non-literal ctx', () => {
    const code = [
      `import { Trans } from '${REACT}'`,
      'export const a = <p><Trans ctx={kind}>Open</Trans></p>',
    ].join('\n')

    expect(() => transform(code, 'a.tsx', OPTIONS)).toThrow(/string literal/)
  })
})

describe('// i18n: descriptions', () => {
  it('attaches the comment above a message', () => {
    const messages = extract(
      src('// i18n: Button label on the home page\nconst a = t`Save`'),
      'a.ts',
    )

    expect(messages[0]!.description).toBe('Button label on the home page')
  })

  it('attaches a block comment on the same line', () => {
    const messages = extract(src('const a = /* i18n: verb */ t`Save`'), 'a.ts')

    expect(messages[0]!.description).toBe('verb')
  })

  it('ignores unrelated comments', () => {
    const messages = extract(src('// just a note\nconst a = t`Save`'), 'a.ts')

    expect(messages[0]!.description).toBeUndefined()
  })

  it('does not attach a comment that is not adjacent', () => {
    const messages = extract(
      src('// i18n: far away\n\n\nconst a = t`Save`'),
      'a.ts',
    )

    expect(messages[0]!.description).toBeUndefined()
  })
})
