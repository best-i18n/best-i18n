import { getLocale as __i18nGetLocale } from "best-i18n/runtime";

export function A({ url }) {
  return (
    <p>
      {(__i18nGetLocale() === "zh" ? `关于` : `About`)}
      {(__i18nGetLocale() === "zh" ? <>{`阅读`}<a href={url}>{`文档`}</a></> : <>{`Read the `}<a href={url}>{`docs`}</a></>)}
    </p>
  )
}
