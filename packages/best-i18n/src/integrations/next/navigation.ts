'use client'

import NextLink from 'next/link'
import {
  usePathname as useNextPathname,
  useRouter as useNextRouter,
} from 'next/navigation'
import { createElement } from 'react'

import { deLocalizePathname, localizePathname } from '../../locale-url.ts'
import { useLocale, useUrlConfig } from '../../react/index.ts'

import type { ComponentProps, ReactNode } from 'react'
import type { UrlConfig } from '../../locale-url.ts'

/**
 * The locale-aware halves of `next/navigation`, exported one by one so an app
 * that only links pays only for `Link`: a factory returning all three in an
 * object would keep the other two alive in every bundle.
 *
 * The URL layout comes from `LocaleProvider`, the one channel the two module
 * graphs share - a client bundle cannot see the server's module state - and
 * it travels once with the provider rather than as a prop on every link.
 */

/**
 * The route tree has no `[locale]` segment, so hrefs are written unprefixed
 * and localized here. Without this every link out of a `/zh` page would drop
 * back to the base locale, and the proxy would faithfully honour it.
 */
function localizeHref(
  href: string,
  locale: string,
  config: UrlConfig | undefined,
): string {
  if (config === undefined) return href

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

function useHrefLocalizer(): (href: string) => string {
  const locale = useLocale()
  const config = useUrlConfig()

  return (href) => localizeHref(href, locale, config)
}

export interface LinkProps extends Omit<
  ComponentProps<typeof NextLink>,
  'href'
> {
  href: string
  /** Link into a specific locale, for a language switcher. */
  locale?: string
}

/**
 * `next/link` with the current locale applied to the href.
 *
 * A client component, which lets a Server Component render it and still get
 * the right prefix: the locale and the URL layout both arrive through
 * `LocaleProvider`, the one channel both module graphs share.
 */
export function Link({ href, locale, ...props }: LinkProps): ReactNode {
  const current = useLocale()
  const config = useUrlConfig()

  return createElement(NextLink, {
    ...props,
    href: localizeHref(href, locale ?? current, config),
  })
}

/**
 * The current pathname as it was authored, without the locale prefix - so a
 * route comparison does not have to know which locale it is running in.
 */
export function usePathname(): string {
  const pathname = useNextPathname()
  const config = useUrlConfig()

  return config === undefined ? pathname : deLocalizePathname(pathname, config)
}

/** `next/navigation`'s router, with `push`/`replace`/`prefetch` localized. */
export function useRouter(): ReturnType<typeof useNextRouter> {
  const router = useNextRouter()
  const localize = useHrefLocalizer()

  return {
    ...router,
    push: (href, options) => router.push(localize(href), options),
    replace: (href, options) => router.replace(localize(href), options),
    prefetch: (href, options) => router.prefetch(localize(href), options),
  }
}
