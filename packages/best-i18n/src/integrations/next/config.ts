import type { RequestConfig } from '../../request.ts'

/**
 * Header the proxy uses to hand the resolved locale to the render.
 *
 * A fallback for routes that sit outside the `[locale]` segment. Inside it the
 * locale is a route param, which survives static prerendering as well.
 */
export const LOCALE_HEADER = 'x-best-i18n-locale'

export interface NextI18nConfig extends RequestConfig {
  /**
   * Name of the root dynamic segment holding the locale, as in
   * `app/[locale]/layout.tsx`.
   *
   * @default 'locale'
   */
  localeParam?: string
  /** Written by the language switcher, read on the next unprefixed visit. */
  cookieName?: string
  cookieMaxAge?: number
}

let active: NextI18nConfig | undefined

/**
 * Identity function that pins the config's type at the definition site, so a
 * typo in `baseLocale` is an error where you wrote it rather than three files
 * away.
 *
 * It also registers the config, which is what lets a Server Component resolve
 * the locale without being handed anything: module state is shared across the
 * whole server graph, and the app imports this module once.
 *
 * Keep the object serializable - it crosses into client components - which is
 * why `exclude` is spelled as a string pattern here.
 *
 * @example
 *   // src/i18n.ts
 *   export const i18n = defineI18nConfig({
 *     locales: ['en', 'zh'],
 *     baseLocale: 'en',
 *     exclude: '^/(api|_next)/',
 *   })
 */
export function defineI18nConfig<T extends NextI18nConfig>(config: T): T {
  active = config
  return config
}

/** The config the app defined, for the pieces nothing can hand one to. */
export function getI18nConfig(): NextI18nConfig | undefined {
  return active
}
