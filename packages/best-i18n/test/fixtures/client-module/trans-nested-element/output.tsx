'use client'
import { useLocale as __i18nUseLocale } from "best-i18n/react";
const __i18nM1 = (l, e0, c0) => (l === "zh" ? <>{`请读 `}{c0(`文档，${e0}`)}</> : <>{`Read the `}{c0(`docs, ${e0}`)}</>);
const __i18nT1 = (__i18nProps) => __i18nM1(__i18nUseLocale(), __i18nProps.e0, __i18nProps.c0);

export function A({ url, name }) {
  return (
    <p>
      <__i18nT1 e0={name} c0={(__i18nChild) => <a href={url}>{__i18nChild}</a>} />
    </p>
  )
}
