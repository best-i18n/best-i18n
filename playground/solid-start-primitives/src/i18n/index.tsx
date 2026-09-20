// oxlint-disable react/only-export-components -- the provider and its hook belong together.
import * as i18n from '@solid-primitives/i18n'
import {
  createContext,
  createResource,
  createSignal,
  useContext,
} from 'solid-js'
import type { Accessor, ParentProps, Setter } from 'solid-js'
import type en from './en.json'
import type { Locale } from './url.ts'

type RawDictionary = typeof en
type Dictionary = i18n.Flatten<RawDictionary>

// Each dictionary is its own chunk and only the active one is fetched - the
// pattern the primitive's README shows.
const dictionaries: Record<Locale, () => Promise<{ default: RawDictionary }>> =
  {
    en: () => import('./en.json'),
    zh: () => import('./zh.json'),
  }

async function fetchDictionary(locale: Locale): Promise<Dictionary> {
  return i18n.flatten((await dictionaries[locale]()).default)
}

interface I18n {
  locale: Accessor<Locale>
  setLocale: Setter<Locale>
  // Nullable: the dictionary is a resource, so `t` is undefined until it lands.
  t: i18n.NullableTranslator<Dictionary>
}

const I18nContext = createContext<I18n>()

export function I18nProvider(props: ParentProps<{ locale: Locale }>) {
  // eslint-disable-next-line solid/reactivity -- the initial value is read once by design
  const [locale, setLocale] = createSignal<Locale>(props.locale)
  const [dict] = createResource(locale, fetchDictionary)
  const t = i18n.translator(dict, i18n.resolveTemplate)
  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {props.children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18n {
  const context = useContext(I18nContext)
  if (context === undefined) {
    throw new Error('useI18n() needs an <I18nProvider> above it.')
  }
  return context
}
