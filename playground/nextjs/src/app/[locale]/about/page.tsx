import { t } from 'best-i18n/macro'
import { Trans } from 'best-i18n/react/macro'

export default function AboutPage() {
  const name = 'best-i18n'

  return (
    <>
      <h1>{t`About`}</h1>
      <p>{t`${name} inlines every translation at the call site.`}</p>
      <p>{t`Nothing is looked up at runtime, so nothing has to be loaded.`}</p>
      {/*
        A message with markup in it. The link is a numbered placeholder in the
        catalog, so a translation can put it wherever the sentence wants it -
        and what ships is the markup itself, rebuilt per locale at build time.
      */}
      <p>
        <Trans>
          Read the <a href='https://github.com/Debbl/best-i18n'>README</a> to
          learn more.
        </Trans>
      </p>
    </>
  )
}
