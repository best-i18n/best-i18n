import { describe, expect, it } from 'vitest'

import { transform } from '../src/compiler/transform.ts'

const MACRO = 'best-i18n/macro'

const OPTIONS = {
  locales: ['en', 'zh'],
  baseLocale: 'en',
  catalog: { About: { en: 'About', zh: '关于' } },
}

function run(code: string, from?: string[]) {
  return transform(code, 'a.tsx', from ? { ...OPTIONS, from } : OPTIONS)
}

/** True when the macro call was replaced. */
function compiled(code: string, from?: string[]) {
  const result = run(code, from)
  return result !== null && !/\b(?:t|tr)`About`/.test(result.code)
}

describe('macro binding resolution', () => {
  it('compiles a direct import', () => {
    expect(compiled(`import { t } from '${MACRO}'\nconst a = t\`About\``)).toBe(
      true,
    )
  })

  it('follows an alias', () => {
    const result = run(
      `import { t as tr } from '${MACRO}'\nconst a = tr\`About\``,
    )!

    expect(result.code).toContain('关于')
    expect(result.code).not.toContain('tr`About`')
  })

  it('leaves an unrelated t from another library alone', () => {
    expect(
      compiled("import { t } from 'some-other-lib'\nconst a = t`About`"),
    ).toBe(false)
  })

  it('leaves a parameter that shadows the name alone', () => {
    expect(compiled('function f(t) { return t`About` }')).toBe(false)
  })

  it('ignores a type-only import', () => {
    expect(run(`import type { t } from '${MACRO}'\nconst a = 1`)).toBeNull()
  })

  it('accepts extra modules that re-export the macro', () => {
    expect(compiled("import { t } from '~/lib/i18n'\nconst a = t`About`")).toBe(
      false,
    )
    expect(
      compiled("import { t } from '~/lib/i18n'\nconst a = t`About`", [
        MACRO,
        '~/lib/i18n',
      ]),
    ).toBe(true)
  })

  it('does not mistake an object key or a member for the macro', () => {
    const result = run(
      `import { t } from '${MACRO}'\nconst o = { t: 1 }\nconst v = x.t\nconst a = t\`About\``,
    )!

    expect(result.code).toContain('关于')
  })
})

describe('macro misuse is a build error', () => {
  it('rejects storing the binding', () => {
    expect(() =>
      run(`import { t } from '${MACRO}'\nconst f = t\nconst a = f\`About\``),
    ).toThrow(/only be used as a tagged template/)
  })

  it('rejects passing the binding, even with no tagged template in the file', () => {
    expect(() => run(`import { t } from '${MACRO}'\nfoo(t)`)).toThrow(
      /only be used as a tagged template/,
    )
  })

  it('rejects a namespace import of the macro module', () => {
    expect(() =>
      run(`import * as ns from '${MACRO}'\nconst a = ns.t\`About\``),
    ).toThrow(/namespace/)
  })
})
