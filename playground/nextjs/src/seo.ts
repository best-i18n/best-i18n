import { localizePathname } from 'best-i18n/locale-url'
import { getLocale } from 'best-i18n/next/server'

import { i18n } from '@/i18n'

import type { Metadata } from 'next'

/**
 * `canonical` plus an `hreflang` entry per locale, for one route.
 *
 * The route is written the way it is authored - `/about`, no prefix - and each
 * locale's public URL is derived from it, which is the same function the
 * navigation helpers use. Nothing here has to know that Chinese lives under
 * `/zh`.
 */
export function localeAlternates(pathname: string): Metadata['alternates'] {
  return {
    canonical: localizePathname(pathname, getLocale(), i18n),
    languages: {
      ...Object.fromEntries(
        i18n.locales.map((locale) => [
          locale,
          localizePathname(pathname, locale, i18n),
        ]),
      ),
      // What a crawler should serve when it has no better match.
      'x-default': localizePathname(pathname, i18n.baseLocale, i18n),
    },
  }
}
