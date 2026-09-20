import { toWebRequest } from 'h3'
import {
  defineNitroPlugin,
  useEvent,
  useRuntimeConfig,
} from 'nitropack/runtime'
import { resolveLocale } from '../../request.ts'
import { setRequestLocaleSource } from '../../runtime/index.ts'
import type { PublicConfig } from './index.ts'

/**
 * Binds the locale to each request. Nuxt's server middleware runs before
 * the render and cannot wrap it, so instead the decision is stored on the
 * event and read back through Nitro's async context: every `getLocale()`
 * during the request - in a component, a composable, an API route - finds
 * the event it belongs to.
 */
export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig().public.bestI18n as PublicConfig

  nitroApp.hooks.hook('request', (event) => {
    // A per-locale build answers in its one locale, whatever was asked.
    event.context.bestI18nLocale =
      config.staticLocale ?? resolveLocale(toWebRequest(event), config)
  })

  setRequestLocaleSource(() => {
    try {
      return useEvent().context.bestI18nLocale as string | undefined
    } catch {
      // Outside a request - a startup task, a scheduled job.
      return undefined
    }
  })
})
