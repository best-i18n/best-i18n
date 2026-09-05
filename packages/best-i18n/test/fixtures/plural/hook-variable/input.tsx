import { plural } from 'best-i18n/macro'
import { useI18n } from 'best-i18n/react/macro'
function A({ n }) {
  const t = useI18n()
  return <p>{t`Hi`}{plural(n, `One item`, `${n} items`)}</p>
}
