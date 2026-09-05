import { getLocale as __i18nGetLocale } from "best-i18n/runtime";
export function A() { return <p>{(__i18nGetLocale() === "zh" ? <>{`第一行`}<br />{`第二行`}</> : <>{`Line one`}<br />{`line two`}</>)}</p> }
