// oxlint-disable react-hooks/rules-of-hooks -- Nuxt composables share React's naming, not its rules.
import {
  defineNuxtPlugin,
  tryUseNuxtApp,
  useHead,
  useRequestEvent,
  useRuntimeConfig,
} from 'nuxt/app'
import { configure, setLocale } from '../../frameworks/vue/index.ts'
import { setRequestLocaleSource } from '../../runtime/index.ts'
import type { PublicConfig } from './index.ts'

let bound = false

/**
 * The two ends of one request. On the server, the locale the Nitro plugin
 * decided goes onto `<html lang>`. On the client it is read back from there
 * before anything renders, so the first client render agrees with the HTML
 * it hydrates - and a per-locale build agrees with itself.
 */
export default defineNuxtPlugin({
  name: 'best-i18n',
  enforce: 'pre',
  setup() {
    const config = useRuntimeConfig().public.bestI18n as PublicConfig
    configure({ locales: config.locales, baseLocale: config.baseLocale })

    if (typeof window === 'undefined') {
      const locale = useRequestEvent()?.context.bestI18nLocale as
        | string
        | undefined
      useHead({ htmlAttrs: { lang: locale ?? config.baseLocale } })

      // The Nitro plugin binds the request for server routes. The Vue app
      // may be bundled with its own copy of the runtime, so the render's
      // reads are bound here as well, from the app's side of the boundary:
      // with `asyncContext` on, the Nuxt app is reachable anywhere in the
      // request, not only inside a component.
      if (!bound) {
        bound = true
        setRequestLocaleSource(
          () =>
            tryUseNuxtApp()?.ssrContext?.event.context.bestI18nLocale as
              | string
              | undefined,
        )
      }
      return
    }

    setLocale(document.documentElement.lang || config.baseLocale)
  },
})
