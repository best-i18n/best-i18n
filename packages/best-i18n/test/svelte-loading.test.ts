import { beforeEach, describe, expect, it, vi } from 'vitest'

const { load, resolve } = vi.hoisted(() => ({
  load: vi.fn<(id: string) => unknown>(),
  resolve: vi.fn<(id: string) => string>(),
}))
vi.mock('node:module', () => ({
  createRequire: () => Object.assign(load, { resolve }),
}))

const { parseSvelte } = await import('../src/compiler/svelte.ts')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('optional svelte compiler loading', () => {
  it('explains a missing compiler and preserves the cause', () => {
    const cause = Object.assign(
      new Error("Cannot find module 'svelte/compiler'\nRequire stack:"),
      { code: 'MODULE_NOT_FOUND' },
    )
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
