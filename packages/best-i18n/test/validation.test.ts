import { describe, expect, it } from 'vitest'

import { transform } from '../src/compiler/transform.ts'

const MACRO = 'best-i18n/macro'
const REACT = 'best-i18n/react/macro'

const options = (catalog: Record<string, Record<string, string>>) => ({
  locales: ['en', 'zh'],
  baseLocale: 'en',
  catalog,
})

describe('translation placeholder validation', () => {
  it('rejects a t translation that drops a placeholder', () => {
    expect(() =>
      transform(
        `import { t } from '${MACRO}'\nconst a = t\`Hi \${name}\``,
        'a.ts',
        options({ 'Hi {name}': { zh: '你好' } }),
      ),
    ).toThrow(/drops \{name\}/)
  })

  it('rejects a t translation that invents a placeholder', () => {
    expect(() =>
      transform(
        `import { t } from '${MACRO}'\nconst a = t\`Hi \${name}\``,
        'a.ts',
        options({ 'Hi {name}': { zh: '你好 {name} {extra}' } }),
      ),
    ).toThrow(/uses \{extra\}/)
  })

  it('names the file, locale and message in the error', () => {
    expect(() =>
      transform(
        `import { t } from '${MACRO}'\nconst a = t\`Hi \${name}\``,
        'a.ts',
        options({ 'Hi {name}': { zh: '你好' } }),
      ),
    ).toThrow(/a\.ts:2 \(zh\) "Hi \{name\}"/)
  })

  it('allows reordering and repeating placeholders', () => {
    const result = transform(
      `import { t } from '${MACRO}'\nconst a = t\`\${a} and \${b}\``,
      'a.ts',
      options({ '{a} and {b}': { zh: '{b}、{a}、再一次 {a}' } }),
    )!

    expect(result.code).toContain('`${b}、${a}、再一次 ${a}`')
  })

  it('treats a literal {n} in the source as required in the translation', () => {
    // `{0}` here is literal text, not a placeholder - the translation must
    // carry it too, and doing so is not an error.
    const result = transform(
      `import { t } from '${MACRO}'\nconst a = t\`Use {0} syntax\``,
      'a.ts',
      options({ 'Use {0} syntax': { zh: '使用 {0} 语法' } }),
    )!

    expect(result.code).toContain('`使用 {0} 语法`')
  })

  it('ignores a literal ${...} in a translation', () => {
    // `${` is text, not a placeholder - it must neither substitute nor fail
    // validation.
    const result = transform(
      `import { t } from '${MACRO}'\nconst a = t\`weird\``,
      'a.ts',
      options({ weird: { zh: '一个 ${notAnExpr} 字面量' } }),
    )!

    expect(result.code).toContain('\\${notAnExpr}')
  })

  it('rejects a <Trans> translation that drops an element', () => {
    const code = [
      `import { Trans } from '${REACT}'`,
      'export const a = <p><Trans>Read the <a href={u}>docs</a> now</Trans></p>',
    ].join('\n')

    expect(() =>
      transform(
        code,
        'a.tsx',
        options({ 'Read the <a>docs</a> now': { zh: '现在就读文档' } }),
      ),
    ).toThrow(/drops <a>/)
  })

  it('rejects a <Trans> translation that drops an expression', () => {
    const code = [
      `import { Trans } from '${REACT}'`,
      'export const a = <p><Trans>Hi <b>{name}</b>!</Trans></p>',
    ].join('\n')

    expect(() =>
      transform(
        code,
        'a.tsx',
        options({ 'Hi <b>{name}</b>!': { zh: '你好<b></b>!' } }),
      ),
    ).toThrow(/drops \{name\}/)
  })

  it('rejects a <Trans> translation that invents an expression', () => {
    const code = [
      `import { Trans } from '${REACT}'`,
      'export const a = <p><Trans>Hi {name}</Trans></p>',
    ].join('\n')

    // `{extra}` has no expression behind it; this used to emit `${}` - a
    // syntax error in generated code - instead of a named build error.
    expect(() =>
      transform(
        code,
        'a.tsx',
        options({ 'Hi {name}': { zh: '你好 {name} {extra}' } }),
      ),
    ).toThrow(/uses \{extra\}/)
  })

  it('allows a <Trans> translation to reorder elements', () => {
    const code = [
      `import { Trans } from '${REACT}'`,
      'export const a = <p><Trans>a <b>x</b> b <i>y</i></Trans></p>',
    ].join('\n')

    const result = transform(
      code,
      'a.tsx',
      options({ 'a <b>x</b> b <i>y</i>': { zh: '<i>乙</i>丙<b>甲</b>' } }),
    )!

    expect(result.code).toContain('<i>')
    expect(result.code).toContain('<b>')
  })
})
