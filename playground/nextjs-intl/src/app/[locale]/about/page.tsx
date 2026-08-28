import { useTranslations } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { use } from 'react'

export default function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = use(params)
  setRequestLocale(locale)

  const t = useTranslations('AboutPage')

  return (
    <>
      <h1>{t('title')}</h1>
      <p>{t('inlines', { name: 'best-i18n' })}</p>
      <p>{t('runtime')}</p>
    </>
  )
}
