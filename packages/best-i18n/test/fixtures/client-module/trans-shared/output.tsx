'use client'
import { useLocale as __i18nUseLocale } from "best-i18n/react";
const __i18nC1 = (__i18nChild) => <b>{__i18nChild}</b>;
const __i18nM1 = (l, c0) => (l === "zh" ? <>{`说`}{c0(`你好`)}</> : <>{`Say `}{c0(`hi`)}</>);
const __i18nT1 = (__i18nProps) => __i18nM1(__i18nUseLocale(), __i18nProps.c0);

export function A() {
  return <p><__i18nT1 c0={__i18nC1} /></p>
}

export function B() {
  return <div><__i18nT1 c0={__i18nC1} /></div>
}
