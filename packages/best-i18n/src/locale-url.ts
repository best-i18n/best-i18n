export interface UrlConfig {
  locales: string[]
  /** Rendered without a path prefix, unless `prefixBase` says otherwise. */
  baseLocale: string
  /**
   * Prefix the base locale too, so `/about` becomes `/en/about`.
   *
   * For deployments where no proxy rewrites URLs - a static export serves
   * only the files that exist, and those live under the `[locale]` segment,
   * so the unprefixed form has nothing behind it.
   */
  prefixBase?: boolean
  /**
   * Paths that must never carry a locale prefix, such as API routes. Without
   * this an API client that posts to a fixed path would be rewritten and 404.
   *
   * A string source is accepted alongside a RegExp so the config can cross a
   * serialization boundary - React Server Components props, a Turbopack loader
   * option - where a RegExp cannot travel.
   */
  exclude?: RegExp | string | undefined
}

const compiled = new Map<string, RegExp>()

function excludePattern(config: UrlConfig): RegExp | undefined {
  const { exclude } = config
  if (exclude === undefined) return undefined
  if (typeof exclude !== 'string') return exclude

  let pattern = compiled.get(exclude)
  if (pattern === undefined) {
    pattern = new RegExp(exclude)
    compiled.set(exclude, pattern)
  }

  return pattern
}

/** Whether a path opts out of locale prefixing entirely. */
export function isPathExcluded(pathname: string, config: UrlConfig): boolean {
  return excludePattern(config)?.test(pathname) ?? false
}

/** Splits a pathname into its locale prefix (if any) and the rest. */
export function splitLocale(
  pathname: string,
  config: UrlConfig,
): { locale: string | undefined; rest: string } {
  if (isPathExcluded(pathname, config))
    return { locale: undefined, rest: pathname }

  for (const locale of config.locales) {
    // Unprefixed means base locale, so a base prefix is not a prefix - except
    // under `prefixBase`, where `/en/about` is the canonical spelling.
    if (locale === config.baseLocale && !config.prefixBase) continue
    if (pathname === `/${locale}`) return { locale, rest: '/' }
    if (pathname.startsWith(`/${locale}/`)) {
      return { locale, rest: pathname.slice(locale.length + 1) }
    }
  }

  return { locale: undefined, rest: pathname }
}

/** The locale a pathname addresses, or the base locale when unprefixed. */
export function localeFromPathname(
  pathname: string,
  config: UrlConfig,
): string {
  return splitLocale(pathname, config).locale ?? config.baseLocale
}

/** `/zh/about` -> `/about`. The route tree is authored without prefixes. */
export function deLocalizePathname(
  pathname: string,
  config: UrlConfig,
): string {
  return splitLocale(pathname, config).rest
}

/**
 * `/about` + `zh` -> `/zh/about`. The base locale stays unprefixed, unless
 * `prefixBase` makes the prefixed form the canonical one.
 */
export function localizePathname(
  pathname: string,
  locale: string,
  config: UrlConfig,
): string {
  const { rest } = splitLocale(pathname, config)

  if (locale === config.baseLocale && !config.prefixBase) return rest
  if (isPathExcluded(rest, config)) return rest

  return rest === '/' ? `/${locale}` : `/${locale}${rest}`
}

export function deLocalizeUrl(url: URL, config: UrlConfig): URL {
  const next = new URL(url)
  next.pathname = deLocalizePathname(next.pathname, config)
  return next
}

export function localizeUrl(url: URL, locale: string, config: UrlConfig): URL {
  const next = new URL(url)
  next.pathname = localizePathname(next.pathname, locale, config)
  return next
}
