'use client'
import { getLocale as __i18nGetLocale } from "best-i18n/runtime";
import { useLocale as __i18nUseLocale } from "best-i18n/react";
const __i18nM1 = (l) => (l === "zh" ? `关于` : `About`);
const __i18nT1 = () => __i18nM1(__i18nUseLocale());

export function A({ cond }) {
  return (
    <p>
      {cond && <__i18nT1 />}
      <img alt={cond ? (__i18nGetLocale() === "zh" ? `只有文字。` : `Just words.`) : ''} />
    </p>
  )
}
