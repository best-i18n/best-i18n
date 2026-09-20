import { init, register } from 'svelte-i18n'

export const locales = ['en', 'zh'] as const
export type Locale = (typeof locales)[number]
export const baseLocale: Locale = 'en'

// Dictionaries are registered as loaders, the way svelte-i18n's SvelteKit
// guide does it: each locale is its own chunk and only the active one loads.
register('en', () => import('./en.json'))
register('zh', () => import('./zh.json'))

init({ fallbackLocale: baseLocale, initialLocale: baseLocale })
