import { useTranslations } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { use } from 'react'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('LongPage')

  return {
    title: t('title'),
    description: t('description'),
  }
}

/**
 * The twin of playground/nextjs's /long page: the same ~30 messages, the same
 * structure, expressed the next-intl way - so `pnpm bench` compares the cost
 * of a text-heavy page between the two libraries rather than between two apps.
 */
export default function LongPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = use(params)
  setRequestLocale(locale)

  const t = useTranslations('LongPage')
  const counts = [0, 1, 2, 5]

  return (
    <article>
      <h1>{t('title')}</h1>
      <p>{t('intro')}</p>

      <h2>{t('whySourceTitle')}</h2>
      <p>{t('whySourceKeys')}</p>
      <p>{t('whySourceCost')}</p>
      <p>{t('whySourcePo', { library: 'best-i18n', format: 'PO' })}</p>

      <h2>{t('longParagraphTitle')}</h2>
      <p>{t('longParagraphBody')}</p>
      <p>{t('longParagraphServer')}</p>

      <h2>{t('pluralsTitle')}</h2>
      <p>{t('pluralsBody')}</p>
      <ul>
        {counts.map((n) => (
          <li key={n}>{t('pluralsItem', { n })}</li>
        ))}
      </ul>

      <h2>{t('contextTitle')}</h2>
      <p>{t('contextBody')}</p>
      <ul>
        <li>{t('openVerb')}</li>
        <li>{t('openAdjective')}</li>
      </ul>

      <h2>{t('markupTitle')}</h2>
      <p>
        {t.rich('markupSentence', {
          strong: (chunks) => <strong>{chunks}</strong>,
          link: (chunks) => (
            <a href='https://github.com/best-i18n/best-i18n'>{chunks}</a>
          ),
        })}
      </p>
      <p>
        {t.rich('markupShips', {
          em: (chunks) => <em>{chunks}</em>,
        })}
      </p>

      <h2>{t('workflowTitle')}</h2>
      <p>{t('workflowExtraction')}</p>
      <p>{t('workflowValidation')}</p>
      <p>{t('workflowFuzzy')}</p>

      <h2>{t('provesTitle')}</h2>
      <p>{t('provesBody')}</p>
    </article>
  )
}
