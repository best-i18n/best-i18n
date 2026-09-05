const __i18nM1 = (l, e0) => (l === "zh" ? `${e0} 件` : ((__i18nN, __i18nI = +(__i18nN != 1)) => __i18nI === 1 ? `${e0} items` : `One item`)(e0));
import { getLocale as __i18nGetLocale } from "best-i18n/runtime";
const a = __i18nM1(__i18nGetLocale(), x.count)
const b = __i18nM1(__i18nGetLocale(), y.count)
