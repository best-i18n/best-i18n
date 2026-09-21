import path from 'node:path'
import process from 'node:process'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { load, resolve, bases } = vi.hoisted(() => ({
  load: vi.fn<(id: string) => unknown>(),
  resolve: vi.fn<(id: string) => string>(),
  bases: [] as string[],
}))
vi.mock('node:module', () => ({
  createRequire: (base: string) => {
    bases.push(base)
    return Object.assign(load, { resolve })
  },
}))

const { parseSvelte } = await import('../src/frameworks/svelte/parse.ts')

const missing = () =>
  Object.assign(
    new Error("Cannot find module 'svelte/compiler'\nRequire stack:"),
    { code: 'MODULE_NOT_FOUND' },
  )

beforeEach(() => {
  vi.resetAllMocks()
  bases.length = 0
})

describe('optional svelte compiler loading', () => {
  it('explains a missing compiler and preserves the cause', () => {
    const cause = missing()
    resolve.mockImplementation(() => {
      throw cause
    })
    expect(() => parseSvelte('', 'Page.svelte')).toThrow(
      expect.objectContaining({
        message: 'best-i18n: install svelte@^5 to translate .svelte files.',
        cause,
      }),
    )
    expect(load).not.toHaveBeenCalled()
  })

  it("looks in the component's project, then the cwd, then here", () => {
    resolve.mockImplementation(() => {
      throw missing()
    })
    expect(() => parseSvelte('', '/apps/web/src/Page.svelte')).toThrow(
      'install svelte@^5',
    )
    expect(bases).toHaveLength(3)
    expect(bases[0]).toBe(path.resolve('/apps/web/src/Page.svelte'))
    expect(path.dirname(bases[1]!)).toBe(process.cwd())
    expect(bases[2]).toMatch(/src\/compiler\/resolve\.ts$/)
  })

  it('stops at the first base that resolves the compiler', () => {
    const cause = new Error('svelte parse reached')
    resolve
      .mockImplementationOnce(() => {
        throw missing()
      })
      .mockReturnValue('/apps/web/node_modules/svelte/compiler/index.js')
    load.mockImplementation(() => {
      throw cause
    })
    expect(() => parseSvelte('', '/apps/web/src/Page.svelte')).toThrow(cause)
    expect(resolve).toHaveBeenCalledTimes(2)
    expect(load).toHaveBeenCalledWith(
      '/apps/web/node_modules/svelte/compiler/index.js',
    )
  })

  it('preserves other resolution failures', () => {
    const cause = Object.assign(new Error('Invalid package exports'), {
      code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    })
    resolve.mockImplementation(() => {
      throw cause
    })
    expect(() => parseSvelte('', 'Page.svelte')).toThrow(cause)
  })

  it('preserves failures inside the installed compiler', () => {
    const cause = Object.assign(
      new Error("Cannot find module 'compiler-dependency'"),
      { code: 'MODULE_NOT_FOUND' },
    )
    resolve.mockReturnValue('/installed/svelte/compiler/index.js')
    load.mockImplementation(() => {
      throw cause
    })
    expect(() => parseSvelte('', 'Page.svelte')).toThrow(cause)
    expect(load).toHaveBeenCalledWith('/installed/svelte/compiler/index.js')
  })
})
