import { getLocale as __i18nGetLocale } from "best-i18n/runtime";
export const a = (__i18nGetLocale() === "zh" ? `${n} 件` : ((__i18nN, __i18nI = +(__i18nN != 1)) => __i18nI === 1 ? `${n} items` : `One item`)(n))
