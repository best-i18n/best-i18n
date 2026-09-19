import { createSubscriber } from 'svelte/reactivity'
import { getLocale as readLocale, subscribeLocale } from './runtime/index.ts'

const trackLocale = createSubscriber(subscribeLocale)

/** Reactive locale read for Svelte 5 templates and $derived expressions. */
export function getLocale(): string {
  trackLocale()
  return readLocale()
}

export { configure, getLocales, setLocale } from './runtime/index.ts'
