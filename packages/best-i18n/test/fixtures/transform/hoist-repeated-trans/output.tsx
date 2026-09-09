const __i18nM1 = (l, c0) => (l === "zh" ? <>{`请阅读`}{c0(`docs`)}{`。`}</> : <>{`Read the `}{c0(`docs`)}{`.`}</>);
import { getLocale as __i18nGetLocale } from "best-i18n/runtime";
export const A = () => <p>{__i18nM1(__i18nGetLocale(), (__i18nChild) => <a href={u1}>{__i18nChild}</a>)}</p>
export const B = () => <p>{__i18nM1(__i18nGetLocale(), (__i18nChild) => <a href={u2}>{__i18nChild}</a>)}</p>
