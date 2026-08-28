import { t } from '../../../src/macro.ts'

export function used(name: string, count: number) {
  return [
    t`A small starter with room to grow.`,
    t`Hi ${name}, you have ${count} items`,
  ].join(' | ')
}

/** Exported but never imported anywhere: must be tree-shaken, message included. */
export function unusedExport() {
  return t`This message must never reach the bundle.`
}
