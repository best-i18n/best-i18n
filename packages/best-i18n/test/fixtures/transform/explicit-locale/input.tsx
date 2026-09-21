import { plural, t } from 'best-i18n/macro'
import { Trans } from 'best-i18n/react/macro'

export function Page({ lang, count }: { lang: string; count: number }) {
  return (
    <>
      <h1>{t.locale('zh')`A small starter with room to grow.`}</h1>
      <p>{t.locale(lang)`A small starter with room to grow.`}</p>
      <p>{t.ctx('verb').locale('zh')`Open`}</p>
      <p>{t.locale(lang).ctx('verb')`Open`}</p>
      <p>{plural.locale(lang)(count, `One item`, `${count} items`)}</p>
      <p>
        <Trans locale="zh">
          Read the <a href="/docs">docs</a>
        </Trans>
      </p>
      <p>
        <Trans locale={lang}>
          Read the <a href="/docs">docs</a>
        </Trans>
      </p>
    </>
  )
}
