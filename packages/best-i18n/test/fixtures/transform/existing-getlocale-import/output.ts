import { getLocale as __i18nGetLocale } from "best-i18n/runtime";
import { getLocale } from 'best-i18n/runtime'
export const a = () => getLocale() + (__i18nGetLocale() === "zh" ? `关于` : `About`)
