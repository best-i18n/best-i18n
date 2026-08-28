import { defineI18nConfig } from 'best-i18n/next/config'

/**
 * The one description of the app's languages and URL shape. The proxy, the root
 * layout and the navigation helpers all read it, so adding a locale is a
 * one-line change here plus a `.po` file.
 */
export const i18n = defineI18nConfig({
  locales: ['en', 'zh'],
  // Rendered without a prefix: `/about`, while Chinese lives at `/zh/about`.
  baseLocale: 'en',
  // A string rather than a RegExp, because this object is handed to client
  // components and a RegExp cannot cross that boundary.
  exclude: '^/(api|_next)/',
})
