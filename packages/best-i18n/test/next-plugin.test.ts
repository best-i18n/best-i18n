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

  describe('plugins', () => {
    it('runs each plugin on the config with the i18n options, in order', () => {
      const seen: string[] = []
      const plugin = (name: string) => ({
        name,
        config(config: any, context: any) {
          seen.push(`${name}:${context.options.baseLocale}`)
          return { ...config, [name]: true }
        },
      })

      const config = createI18nPlugin({
        ...BASE,
        plugins: [plugin('first'), plugin('second')],
      })({ output: 'export' }) as any

      expect(seen).toEqual(['first:en', 'second:en'])
      expect(config.first).toBe(true)
      expect(config.second).toBe(true)
      expect(config.output).toBe('export')
      // The loader rules go on top of what the plugins returned.
      expect(Object.keys(config.turbopack.rules)).toHaveLength(1)
    })

    it('runs the incoming webpack hook before adding the loader', () => {
      const config = createI18nPlugin(BASE)({
        webpack(webpackConfig: any) {
          webpackConfig.module.rules.push({ test: /app/ })
          return webpackConfig
        },
      }) as any

      const webpackConfig = config.webpack({ module: { rules: [] } }, {})
      expect(webpackConfig.module.rules).toHaveLength(2)
      expect(webpackConfig.module.rules[0].test).toEqual(/app/)
      expect(webpackConfig.module.rules[1].exclude).toEqual(/node_modules/)
    })

    it('keeps the config when a plugin returns nothing, and keeps plugins out of the loader', () => {
      const config = createI18nPlugin({
        ...BASE,
        plugins: [{ name: 'noop', config() {} }],
      })({ output: 'export' }) as any

      expect(config.output).toBe('export')
      const glob = Object.keys(config.turbopack.rules)[0]!
      expect('plugins' in config.turbopack.rules[glob].loaders[0].options).toBe(
        false,
      )
    })
  })
})
