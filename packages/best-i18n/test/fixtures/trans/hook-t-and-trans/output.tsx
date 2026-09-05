import { useLocale as __i18nUseLocale } from "best-i18n/react";
export function A() {
  const t = __i18nUseLocale()
  return (
    <p title={(t === "zh" ? `只有文字。` : `Just words.`)}>
      {(t === "zh" ? <>{`阅读`}<a href={url}>{`文档`}</a>{`了解更多。`}</> : <>{`Read the `}<a href={url}>{`docs`}</a>{` to learn more.`}</>)}
    </p>
  )
}
