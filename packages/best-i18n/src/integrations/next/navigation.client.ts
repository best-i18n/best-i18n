'use client'

import NextLink from 'next/link'
import {
  usePathname as useNextPathname,
  useRouter as useNextRouter,
} from 'next/navigation'
import { createElement } from 'react'

import { deLocalizePathname, localizePathname } from '../../locale-url.ts'
import { useLocale } from '../../react/index.ts'

import type { ComponentProps, ReactNode } from 'react'
import type { UrlConfig } from '../../locale-url.ts'

/**
 * The client half of `createNavigation`. The factory itself must be callable
 * during server module evaluation - so it lives in a shared module and hands
 * the config down here, where the hooks are.
 */

/**
 * The route tree has no `[locale]` segment, so hrefs are written unprefixed
 * and localized here. Without this every link out of a `/zh` page would drop
 * back to the base locale, and the proxy would faithfully honour it.
 */
function localizeHref(href: string, locale: string, config: UrlConfig): string {
  // Absolute URLs and fragments are not ours to rewrite.
  if (!href.startsWith('/')) return href

  const [pathname = '/', suffix = ''] = splitSuffix(href)

  return `${localizePathname(pathname, locale, config)}${suffix}`
}

/** Splits `/about?a=1#x` into its pathname and everything after it. */
function splitSuffix(href: string): [string, string] {
  const index = href.search(/[?#]/)
  return index === -1 ? [href, ''] : [href.slice(0, index), href.slice(index)]
}

export interface LocalizedLinkProps extends Omit<
  ComponentProps<typeof NextLink>,
  'href'
> {
  href: string
  /** Link into a specific locale, for a language switcher. */
  locale?: string
  /** Crosses the server/client boundary as a prop, so it must serialize. */
  config: UrlConfig
}

export function LocalizedLink({
  href,
  locale,
  config,
  ...props
}: LocalizedLinkProps): ReactNode {
  const current = useLocale()

  return createElement(NextLink, {
    ...props,
    href: localizeHref(href, locale ?? current, config),
  })
}

/**
 * The current pathname as it was authored, without the locale prefix - so a
 * route comparison does not have to know which locale it is running in.
 */
export function useLocalizedPathname(config: UrlConfig): string {
  return deLocalizePathname(useNextPathname(), config)
}

/** `next/navigation`'s router, with `push`/`replace`/`prefetch` localized. */
export function useLocalizedRouter(
  config: UrlConfig,
): ReturnType<typeof useNextRouter> {
  const router = useNextRouter()
  const locale = useLocale()
  const localize = (href: string) => localizeHref(href, locale, config)

  return {
    ...router,
    push: (href, options) => router.push(localize(href), options),
    replace: (href, options) => router.replace(localize(href), options),
    prefetch: (href, options) => router.prefetch(localize(href), options),
  }
}
