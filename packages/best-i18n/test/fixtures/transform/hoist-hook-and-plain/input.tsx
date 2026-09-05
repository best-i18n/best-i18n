import { t } from 'best-i18n/macro'
import { useI18n } from 'best-i18n/react/macro'
export const a = t`A small starter with room to grow.`
export function C() {
  const t2 = useI18n()
  return <p>{t2`A small starter with room to grow.`}</p>
}
