import { useLocale as __i18nUseLocale } from "best-i18n/react";
function A({ n }) {
  const t = __i18nUseLocale()
  return <p>{(t === "zh" ? `嗨` : `Hi`)}{(t === "zh" ? `${n} 件` : ((__i18nN, __i18nI = +(__i18nN != 1)) => __i18nI === 1 ? `${n} items` : `One item`)(n))}</p>
}
