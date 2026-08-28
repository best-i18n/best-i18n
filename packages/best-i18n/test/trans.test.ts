import { describe, expect, it } from 'vitest'

import { extract, transform } from '../src/compiler/transform.ts'

const MACRO = 'best-i18n/react/macro'

const OPTIONS = {
  locales: ['en', 'zh'],
  baseLocale: 'en',
  catalog: {
    'Read the <0>docs</0> to learn more.': {
      en: 'Read the <0>docs</0> to learn more.',
      zh: '阅读<0>文档</0>了解更多。',
    },
    'Hi {0}, you have <0>{1} items</0>.': {
      en: 'Hi {0}, you have <0>{1} items</0>.',
      zh: '你好 {0}，你有 <0>{1} 项</0>。',
    },
    'Just words.': { en: 'Just words.', zh: '只有文字。' },
    'A <0>b <1>c</1></0> d': {
      en: 'A <0>b <1>c</1></0> d',
      zh: 'D <0><1>C</1> B</0> A',
    },
    'Line one<0/>line two': {
      en: 'Line one<0/>line two',
      zh: '第一行<0/>第二行',
    },
  },
}

function file(body: string) {
  return `import { Trans } from '${MACRO}'\nexport function A() { return ${body} }`
}

describe('<Trans>', () => {
  it('stores markup as numbered placeholders', () => {
    const [message] = extract(
      file(
        '<p><Trans>Read the <a href={url}>docs</a> to learn more.</Trans></p>',
      ),
      'a.tsx',
    )

    expect(message?.text).toBe('Read the <0>docs</0> to learn more.')
  })

  it('collapses JSX whitespace the way JSX itself does', () => {
    const [message] = extract(
      file(`(
        <Trans>
          Read the <a href={url}>docs</a> to learn more.
        </Trans>
      )`),
      'a.tsx',
    )

    // Indentation and the surrounding newlines are not part of the message,
    // or re-indenting a component would orphan every translation of it.
    expect(message?.text).toBe('Read the <0>docs</0> to learn more.')
  })

  it('drops the space a newline swallows, as JSX does', () => {
    const [message] = extract(
      file(`(
        <Trans>
          Read the <a href={url}>docs</a>
          to learn more.
        </Trans>
      )`),
      'a.tsx',
    )

    // JSX renders this without a space, which is the reason `{' '}` exists.
    // The message has to say so, otherwise the translation would read better
    // than the page does.
    expect(message?.text).toBe('Read the <0>docs</0>to learn more.')
  })

  it('rebuilds the markup around a reordered translation', () => {
    const result = transform(
      file(
        '<p><Trans>Read the <a href={url}>docs</a> to learn more.</Trans></p>',
      ),
      'a.tsx',
      OPTIONS,
    )!

    expect(result.code).toContain(
      '<>{`阅读`}<a href={url}>{`文档`}</a>{`了解更多。`}</>',
    )
    expect(result.code).toContain(
      '<>{`Read the `}<a href={url}>{`docs`}</a>{` to learn more.`}</>',
    )
    // A JSX child has to stay an expression, or it becomes text.
    expect(result.code).toContain('<p>{(__i18nGetLocale() === "zh" ?')
  })

  it('keeps expressions positional across markup', () => {
    const source = file(
      '<p><Trans>Hi {name}, you have <b>{count} items</b>.</Trans></p>',
    )

    expect(extract(source, 'a.tsx')[0]?.text).toBe(
      'Hi {0}, you have <0>{1} items</0>.',
    )

    const result = transform(source, 'a.tsx', OPTIONS)!
    expect(result.code).toContain(
      '<>{`你好 ${name}，你有 `}<b>{`${count} 项`}</b>{`。`}</>',
    )
  })

  it('emits a plain template literal when the message has no markup', () => {
    const result = transform(
      file('<p><Trans>Just words.</Trans></p>'),
      'a.tsx',
      OPTIONS,
    )!

    expect(result.code).toContain(
      '<p>{(__i18nGetLocale() === "zh" ? `只有文字。` : `Just words.`)}</p>',
    )
    expect(result.code).not.toContain('<>')
  })

  it('handles nested markup and self-closing elements', () => {
    const nested = transform(
      file('<p><Trans>A <i>b <b>c</b></i> d</Trans></p>'),
      'a.tsx',
      OPTIONS,
    )!
    expect(nested.code).toContain('<>{`A `}<i>{`b `}<b>{`c`}</b></i>{` d`}</>')
    // The translation moved the inner element ahead of its sibling text.
    expect(nested.code).toContain('<>{`D `}<i><b>{`C`}</b>{` B`}</i>{` A`}</>')

    const void_ = transform(
      file('<p><Trans>Line one<br />line two</Trans></p>'),
      'a.tsx',
      OPTIONS,
    )!
    expect(void_.code).toContain('<>{`第一行`}<br />{`第二行`}</>')
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

  it('collapses to one locale in a per-locale build', () => {
    const result = transform(
      file(
        '<p><Trans>Read the <a href={url}>docs</a> to learn more.</Trans></p>',
      ),
      'a.tsx',
      { ...OPTIONS, staticLocale: 'zh' },
    )!

    expect(result.code).toContain(
      '<p>{<>{`阅读`}<a href={url}>{`文档`}</a>{`了解更多。`}</>}</p>',
    )
    expect(result.code).not.toContain('getLocale')
    expect(result.code).not.toContain('Read the')
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
