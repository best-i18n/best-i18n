const __i18nM1 = (l, e0) => (l === "zh" ? `你好 ${e0}` : `Hi ${e0}`);
import { getLocale as __i18nGetLocale } from "best-i18n/runtime";
const a = __i18nM1(__i18nGetLocale(), user.name)
const b = __i18nM1(__i18nGetLocale(), admin.name)
