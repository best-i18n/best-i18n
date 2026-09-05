import { getLocale as __i18nGetLocale } from "best-i18n/runtime";
export function A() {
  return (
    <div title={(__i18nGetLocale() === "zh" ? `只有文字。` : `Just words.`)}>
      {(__i18nGetLocale() === "zh" ? <>{`阅读`}<a href={url}>{`文档`}</a>{`了解更多。`}</> : <>{`Read the `}<a href={url}>{`docs`}</a>{` to learn more.`}</>)}
    </div>
  )
}
