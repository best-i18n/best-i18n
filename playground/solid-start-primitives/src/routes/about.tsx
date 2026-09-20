import { useI18n } from '../i18n/index.tsx'

export default function About() {
  const { t } = useI18n()
  const name = '@solid-primitives/i18n'
  return (
    <>
      <h1>{t('about')}</h1>
      <p>{t('inlines', { name })}</p>
      <p>{t('no_runtime')}</p>
      {/*
        Dictionary values are strings, so a sentence with a link in it is
        split into three keys by hand - and the split fixes the word order for
        every language.
      */}
      <p>
        {t('read_the')}
        <a href='https://github.com/best-i18n/best-i18n'>{t('readme')}</a>
        {t('to_learn_more')}
      </p>
    </>
  )
}
