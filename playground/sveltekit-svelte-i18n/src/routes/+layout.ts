import { locale, waitLocale } from 'svelte-i18n'
import '$lib/i18n'
import type { LayoutLoad } from './$types'

export const load: LayoutLoad = async ({ data }) => {
  locale.set(data.locale)
  await waitLocale(data.locale)
  return data
}
