import { t } from '../../../src/macro.ts'

export function used(name: string, count: number) {
  return [
    t`A small starter with room to grow.`,
    t`Hi ${name}, you have ${count} items`,
  ].join(' | ')
}

/**
 * The same message `used()` renders, at a second call site: in a single build
 * the module hoists it into one shared function, so the translations exist
 * once in the bundle however many call sites repeat them.
 */
export function repeated(name: string, count: number) {
  return t`Hi ${name}, you have ${count} items`
}

/** Exported but never imported anywhere: must be tree-shaken, message included. */
export function unusedExport() {
  return t`This message must never reach the bundle.`
}
