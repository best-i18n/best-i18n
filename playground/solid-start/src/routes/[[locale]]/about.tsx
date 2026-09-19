import { t } from 'best-i18n/macro'

export default function About() {
  return (
    <>
      <h1>{t`About`}</h1>
      <p>{t`Translations are compiled into your application.`}</p>
    </>
  )
}
