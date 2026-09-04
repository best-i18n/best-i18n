import { describe, expect, it } from 'vitest'

import { createI18nPlugin } from '../src/integrations/next/index.ts'

const BASE = {
  messagesDir: '/tmp/messages',
  locales: ['en', 'zh'],
  baseLocale: 'en',
}

describe('createI18nPlugin', () => {
  it('registers the loader for both bundlers, preserving existing config', () => {
    const withI18n = createI18nPlugin(BASE)
    const config = withI18n({
      turbopack: { rules: { '*.svg': { loaders: ['svg-loader'] } } },
    }) as any

    // The app's own rule survives alongside ours.
    expect(config.turbopack.rules['*.svg']).toBeDefined()
    const ours = Object.entries(config.turbopack.rules).find(
      ([glob]) => glob !== '*.svg',
    )!
    expect((ours[1] as any).loaders[0].options.locales).toEqual(['en', 'zh'])

    const webpackConfig = config.webpack({ module: { rules: [] } }, {})
    expect(webpackConfig.module.rules).toHaveLength(1)
    expect(webpackConfig.module.rules[0].use[0].options.baseLocale).toBe('en')
  })

  it('drops undefined options, which Turbopack refuses to serialize', () => {
    const config = createI18nPlugin({
      ...BASE,
      staticLocale: undefined,
    })({}) as any

    const glob = Object.keys(config.turbopack.rules)[0]!
    const options = config.turbopack.rules[glob].loaders[0].options
    expect('staticLocale' in options).toBe(false)
  })
})
