const __i18nM1 = (l) => (l === "zh" ? `一个小而可长的起始模板。` : `A small starter with room to grow.`);
import { useLocale as __i18nUseLocale } from "best-i18n/react";
import { getLocale as __i18nGetLocale } from "best-i18n/runtime";
export const a = __i18nM1(__i18nGetLocale())
export function C() {
  const t2 = __i18nUseLocale()
  return <p>{__i18nM1(t2)}</p>
}
