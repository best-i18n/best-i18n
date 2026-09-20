
export function Page({ lang, count }: { lang: string; count: number }) {
  return (
    <>
      <h1>{`一个小而可长的起始模板。`}</h1>
      <p>{(lang === "zh" ? `一个小而可长的起始模板。` : `A small starter with room to grow.`)}</p>
      <p>{`打开`}</p>
      <p>{(lang === "zh" ? `打开` : `Open`)}</p>
      <p>{(lang === "zh" ? `${count} 项` : ((__i18nN, __i18nI = +(__i18nN != 1)) => __i18nI === 1 ? `${count} items` : `One item`)(count))}</p>
      <p>
        {<>{`阅读`}<a href="/docs">{`文档`}</a></>}
      </p>
      <p>
        {(lang === "zh" ? <>{`阅读`}<a href="/docs">{`文档`}</a></> : <>{`Read the `}<a href="/docs">{`docs`}</a></>)}
      </p>
    </>
  )
}
