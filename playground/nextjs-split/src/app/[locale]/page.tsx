import { t } from 'best-i18n/macro'

// `app/[locale]/page.tsx` at depth 2: `[locale]` is a route segment and does
// not count, and a shard path never ends on one - so this lands in `app`.
export default function HomePage() {
  return (
    <>
      <h1>{t`Workspace`}</h1>
      <p>{t`Each area of this app keeps its own translations.`}</p>
      <p>
        {t`Open billing or settings, then look under messages/ to see which file each text came from.`}
      </p>
    </>
  )
}
