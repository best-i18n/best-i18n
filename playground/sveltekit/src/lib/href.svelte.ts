import { localizePathname } from 'best-i18n/locale-url'
import { getLocale } from 'best-i18n/svelte'
import { i18n } from './i18n'

/** `/about` while Chinese is active becomes `/zh/about`. */
export function href(path: string): string {
  return localizePathname(path, getLocale(), i18n)
}
