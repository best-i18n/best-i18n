import { defineRouting } from 'next-intl/routing'

/** Mirrors `playground/nextjs`: English unprefixed, Chinese under `/zh`. */
export const routing = defineRouting({
  locales: ['en', 'zh'],
  defaultLocale: 'en',
  localePrefix: 'as-needed',
})
