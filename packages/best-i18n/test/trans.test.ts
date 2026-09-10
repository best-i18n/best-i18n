import { describe, expect, it } from 'vitest'

import { extract, transform } from '../src/compiler/transform.ts'
import { fixture, json } from './helpers/fixture.ts'

const MACRO = 'best-i18n/react/macro'

const OPTIONS = {
  locales: ['en', 'zh'],
  baseLocale: 'en',
  catalog: {
    'Read the <a>docs</a> to learn more.': {
      en: 'Read the <a>docs</a> to learn more.',
      zh: '阅读<a>文档</a>了解更多。',
    },
    'Hi {name}, you have <b>{count} items</b>.': {
      en: 'Hi {name}, you have <b>{count} items</b>.',
      zh: '你好 {name}，你有 <b>{count} 项</b>。',
    },
    'Just words.': { en: 'Just words.', zh: '只有文字。' },
    'A <i>b <b>c</b></i> d': {
      en: 'A <i>b <b>c</b></i> d',
      zh: 'D <i><b>C</b> B</i> A',
    },
    'Line one<br/>line two': {
      en: 'Line one<br/>line two',
      zh: '第一行<br/>第二行',
    },
  },
}

function file(body: string) {
  return `import { Trans } from '${MACRO}'\nexport function A() { return ${body} }`
}

describe('<Trans>', () => {
  it('stores markup as named placeholders', async () => {
    const [message] = extract(
      fixture('trans/extract-markup-placeholders/input.tsx'),
      'a.tsx',
    )

    await expect(json(message)).toMatchFileSnapshot(
      'fixtures/trans/extract-markup-placeholders/messages.json',
    )
  })

  it('collapses JSX whitespace the way JSX itself does', async () => {
    const [message] = extract(
      fixture('trans/extract-whitespace-collapse/input.tsx'),
      'a.tsx',
    )

    // Indentation and the surrounding newlines are not part of the message,
    // or re-indenting a component would orphan every translation of it.
    await expect(json(message)).toMatchFileSnapshot(
      'fixtures/trans/extract-whitespace-collapse/messages.json',
    )
  })

  it('drops the space a newline swallows, as JSX does', async () => {
    const [message] = extract(
      fixture('trans/extract-newline-swallows-space/input.tsx'),
      'a.tsx',
    )

    // JSX renders this without a space, which is the reason `{' '}` exists.
    // The message has to say so, otherwise the translation would read better
    // than the page does.
    await expect(json(message)).toMatchFileSnapshot(
      'fixtures/trans/extract-newline-swallows-space/messages.json',
    )
  })

  it('rebuilds the markup around a reordered translation', async () => {
    const result = transform(
      fixture('trans/reordered-translation/input.tsx'),
      'a.tsx',
      OPTIONS,
    )!

    // A JSX child has to stay an expression, or it becomes text.
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/trans/reordered-translation/output.tsx',
    )
  })

  it('names expressions across markup', async () => {
    const source = fixture('trans/expressions-across-markup/input.tsx')

    await expect(json(extract(source, 'a.tsx')[0])).toMatchFileSnapshot(
      'fixtures/trans/expressions-across-markup/messages.json',
    )

    const result = transform(source, 'a.tsx', OPTIONS)!
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/trans/expressions-across-markup/output.tsx',
    )
  })

  it('emits a plain template literal when the message has no markup', async () => {
    const result = transform(
      fixture('trans/no-markup-literal/input.tsx'),
      'a.tsx',
      OPTIONS,
    )!

    await expect(result.code).toMatchFileSnapshot(
      'fixtures/trans/no-markup-literal/output.tsx',
    )
  })

  it('handles nested markup and self-closing elements', async () => {
    const nested = transform(
      fixture('trans/nested-markup/input.tsx'),
      'a.tsx',
      OPTIONS,
    )!
    // The translation moved the inner element ahead of its sibling text.
    await expect(nested.code).toMatchFileSnapshot(
      'fixtures/trans/nested-markup/output.tsx',
    )

    const void_ = transform(
      fixture('trans/self-closing/input.tsx'),
      'a.tsx',
      OPTIONS,
    )!
    await expect(void_.code).toMatchFileSnapshot(
      'fixtures/trans/self-closing/output.tsx',
    )
  })

  it('compiles t`` and <Trans> in one file and drops both macro imports', async () => {
    const result = transform(
      fixture('trans/mixed-t-and-trans/input.tsx'),
      'a.tsx',
      OPTIONS,
    )!

    // Both bindings compiled away, so neither import may survive - the macro
    // modules' runtime halves are throwing stubs.
    expect(result.code).not.toContain('macro')
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/trans/mixed-t-and-trans/output.tsx',
    )
  })

  it('compiles the useI18n() t and <Trans> together off one hook variable', async () => {
    const result = transform(
      fixture('trans/hook-t-and-trans/input.tsx'),
      'a.tsx',
      OPTIONS,
    )!

    // One import declaration carried both macros - it goes as a whole, and
    // both sites dispatch on the hook variable, not getLocale().
    expect(result.code).not.toContain('macro')
    expect(result.code).not.toContain('getLocale')
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/trans/hook-t-and-trans/output.tsx',
    )
  })

  it('reads the enclosing useI18n() variable when there is one', () => {
    const result = transform(
      `import { useI18n, Trans } from '${MACRO}'\n` +
        'export function A() {\n' +
        '  const t = useI18n()\n' +
        '  return <p>{t`Just words.`}<Trans>Just words.</Trans></p>\n' +
        '}',
      'a.tsx',
      OPTIONS,
    )!

    // Both read the hook variable, so a client component gets its locale from
    // the provider rather than the ambient store - and re-renders with it.
    expect(result.code.match(/t === "zh"/g)).toHaveLength(2)
    expect(result.code).not.toContain('getLocale')
  })

  it('falls back to getLocale() outside a component that calls the hook', () => {
    const result = transform(
      `import { useI18n, Trans } from '${MACRO}'\n` +
        'export function A() { const t = useI18n(); return t`Just words.` }\n' +
        'export function B() { return <p><Trans>Just words.</Trans></p> }',
      'a.tsx',
      OPTIONS,
    )!

    // B has no hook of its own, and must not borrow A's variable.
    expect(result.code).toContain('__i18nGetLocale() === "zh"')
  })

  it('sees the hook variable through a nested closure', () => {
    const result = transform(
      `import { useI18n, Trans } from '${MACRO}'\n` +
        'export function A() {\n' +
        '  const t = useI18n()\n' +
        '  return items.map(() => <li><Trans>Just words.</Trans></li>)\n' +
        '}',
      'a.tsx',
      OPTIONS,
    )!

    expect(result.code).toContain('t === "zh"')
    expect(result.code).not.toContain('getLocale')
  })

  it('collapses to one locale in a per-locale build', async () => {
    const result = transform(
      fixture('trans/static-locale-zh/input.tsx'),
      'a.tsx',
      { ...OPTIONS, staticLocale: 'zh' },
    )!

    await expect(result.code).toMatchFileSnapshot(
      'fixtures/trans/static-locale-zh/output.tsx',
    )
  })

  it('rejects props, an empty element, and use as a value', () => {
    expect(() =>
      transform(file('<Trans id="x">Just words.</Trans>'), 'a.tsx', OPTIONS),
    ).toThrow(/takes no props/)

    expect(() => transform(file('<Trans />'), 'a.tsx', OPTIONS)).toThrow(
      /is empty/,
    )

    expect(() =>
      transform(
        `import { Trans } from '${MACRO}'\nconst C = Trans`,
        'a.tsx',
        OPTIONS,
      ),
    ).toThrow(/compile-time macro/)
  })

  it('refuses one message nested inside another', () => {
    expect(() =>
      transform(
        `import { Trans } from '${MACRO}'\n` +
          'export function A() { return <p><Trans>a <b><Trans>b</Trans></b></Trans></p> }',
        'a.tsx',
        OPTIONS,
      ),
    ).toThrow(/nested messages/)
  })

  it('reports a broken translation with the message it came from', () => {
    expect(() =>
      transform(file('<p><Trans>Just words.</Trans></p>'), 'a.tsx', {
        ...OPTIONS,
        catalog: { 'Just words.': { en: 'Just words.', zh: '坏了 <0>' } },
      }),
    ).toThrow(/<0> is never closed/)
  })
})
