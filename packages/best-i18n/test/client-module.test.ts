import { describe, expect, it } from 'vitest'

import { transform } from '../src/compiler/transform.ts'
import { clientModuleError } from '../src/integrations/next/loader.ts'
import { fixture } from './helpers/fixture.ts'

const OPTIONS = {
  locales: ['en', 'zh'],
  baseLocale: 'en',
  catalog: {
    'About': { en: 'About', zh: '关于' },
    'Just words.': { en: 'Just words.', zh: '只有文字。' },
    'Say <b>hi</b>': { en: 'Say <b>hi</b>', zh: '说<b>你好</b>' },
    'Read the <a>docs</a>': {
      en: 'Read the <a>docs</a>',
      zh: '阅读<a>文档</a>',
    },
    'Read the <a>docs, {name}</a>': {
      en: 'Read the <a>docs, {name}</a>',
      zh: '请读 <a>文档，{name}</a>',
    },
  },
}

/** Compiles a fixture case's input the way the Next.js loader would. */
function compile(name: string, staticLocale?: string) {
  return transform(fixture(`client-module/${name}/input.tsx`), 'a.tsx', {
    ...OPTIONS,
    staticLocale,
  })!
}

/** What the loader would say about it, if anything. */
function check(name: string, staticLocale?: string) {
  return clientModuleError({
    filename: 'a.tsx',
    unbound: compile(name, staticLocale).clientUnbound,
  })
}

describe('a message in a Client Component', () => {
  it('is rejected when it has no useI18n() above it', async () => {
    const error = check('t-no-hook')

    // The offending message is named, not just the file, and the message says
    // what to do about it - including what <Trans> gets for free.
    await expect(error).toMatchFileSnapshot(
      'fixtures/client-module/t-no-hook/error.txt',
    )
  })

  it('accepts both t and <Trans> once the hook binds them', async () => {
    const result = compile('hook-binds-both')

    expect(result.clientUnbound).toEqual([])
    expect(result.code).not.toContain('getLocale')
    // Both dispatch on the hook variable, and neither is wrapped: there is
    // nothing left for a generated component to solve.
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/client-module/hook-binds-both/output.tsx',
    )
  })

  it('leaves a Server Component alone', async () => {
    const result = compile('server-component')

    expect(result.clientUnbound).toEqual([])
    // A server render has the request's locale, so `t` and `<Trans>` both
    // stay inline and read it - no hook, no component, no wrapper.
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/client-module/server-component/output.tsx',
    )
  })

  it('says nothing in a per-locale build, where there is no locale to read', () => {
    expect(check('t-no-hook', 'zh')).toBeUndefined()
  })

  it('says nothing when the config has one locale, which cannot vary', async () => {
    const result = transform(
      fixture('client-module/t-single-locale/input.tsx'),
      'a.tsx',
      { locales: ['en'], baseLocale: 'en', catalog: OPTIONS.catalog },
    )!

    // The message compiles to a bare literal, so nothing reads a locale and
    // there is nothing to bind.
    expect(result.clientUnbound).toEqual([])
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/client-module/t-single-locale/output.tsx',
    )
  })
})

describe('a <Trans> in a Client Component', () => {
  it('is bound by a generated component where an element is valid', async () => {
    const result = compile('trans-nested-element')

    // No hook in the file, and yet nothing reads the ambient locale: the
    // message became a component, which is a legal place for the hook. The
    // element stays at the call site, where `url` is in scope, and arrives as
    // a render prop.
    expect(result.clientUnbound).toEqual([])
    expect(result.code).not.toContain('getLocale')
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/client-module/trans-nested-element/output.tsx',
    )
  })

  it('is still rejected where a string may be wanted', async () => {
    // An element in `alt` renders as "[object Object]", so this one cannot be
    // solved by giving the message a component of its own.
    await expect(check('trans-string-position')).toMatchFileSnapshot(
      'fixtures/client-module/trans-string-position/error.txt',
    )
  })

  it('is bound behind a condition among children, not inside an attribute', async () => {
    const result = compile('trans-conditional')

    // Both sit behind an operator, and both have a JSXExpressionContainer for
    // a parent - only the ancestor above it says which is which.
    expect(result.clientUnbound).toEqual([{ text: 'Just words.', line: 8 }])
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/client-module/trans-conditional/output.tsx',
    )
  })

  it('shares one generated component between call sites', async () => {
    const result = compile('trans-shared')

    // One component, one copy of the translations, and the `<b>` - which
    // names nothing local - hoisted to module scope and allocated once.
    expect(result.code.match(/关于|你好/g)).toHaveLength(1)
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/client-module/trans-shared/output.tsx',
    )
  })

  it('is left inline in a per-locale build', async () => {
    const result = compile('trans-static-locale', 'zh')

    // Nothing to read the locale from, so there is nothing to wrap.
    expect(result.code).not.toContain('__i18nT1')
    await expect(result.code).toMatchFileSnapshot(
      'fixtures/client-module/trans-static-locale/output.tsx',
    )
  })
})
