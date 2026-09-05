import { getLocale as __i18nGetLocale } from "best-i18n/runtime";
export function A() { return <p>{(__i18nGetLocale() === "zh" ? <>{`你好 ${name}，你有 `}<b>{`${count} 项`}</b>{`。`}</> : <>{`Hi ${name}, you have `}<b>{`${count} items`}</b>{`.`}</>)}</p> }
