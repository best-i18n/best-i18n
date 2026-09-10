import { useTranslations } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { use } from 'react'

import { Counter } from '@/components/counter'

export default function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = use(params)
  setRequestLocale(locale)

  const t = useTranslations('HomePage')

  return (
    <>
      <h1>{t('title')}</h1>
      <p>{t('server')}</p>
      <Counter />
    </>
  )
}
