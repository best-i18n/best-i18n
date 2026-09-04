import { createElement } from 'react'

import {
  LocalizedLink,
  useLocalizedPathname,
  useLocalizedRouter,
} from './navigation.client.ts'

import type { useRouter as useNextRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import type { UrlConfig } from '../../locale-url.ts'
import type { LocalizedLinkProps } from './navigation.client.ts'

export interface LinkProps extends Omit<LocalizedLinkProps, 'config'> {}

export interface Navigation {
  /** `next/link` with the current locale applied to the href. */
  Link: (props: LinkProps) => ReactNode
  /** The current pathname as authored, without the locale prefix. */
  usePathname: () => string
  /** `next/navigation`'s router, with `push`/`replace`/`prefetch` localized. */
  useRouter: () => ReturnType<typeof useNextRouter>
}

/**
 * Builds the locale-aware halves of `next/navigation` around the app's config,
 * bound once at creation - no provider has to be above a `<Link>` for its href
 * to come out right.
 *
 * Deliberately not a client module: the factory runs during module evaluation
 * of whatever imports it, server side included. `Link` is a plain component
 * that renders the client half with the config as a (serializable) prop; the
 * hooks close over the config and run where hooks run, in Client Components.
 * This is also where URL features grow: a localized-pathnames table, a
 * `redirect`, a `getPathname` all belong to this factory's options.
 *
 * @example
 *   // src/navigation.ts
 *   import { createNavigation } from 'best-i18n/next/navigation'
 *   import { i18n } from './i18n'
 *
 *   export const { Link, usePathname, useRouter } = createNavigation(i18n)
 */
export function createNavigation(config: UrlConfig): Navigation {
  return {
    Link: (props) => createElement(LocalizedLink, { ...props, config }),
    usePathname: () => useLocalizedPathname(config),
    useRouter: () => useLocalizedRouter(config),
  }
}
