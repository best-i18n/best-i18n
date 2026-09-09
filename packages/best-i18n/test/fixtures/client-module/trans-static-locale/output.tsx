'use client'

export function A({ url, name }) {
  return (
    <p>
      {<>{`请读 `}<a href={url}>{`文档，${name}`}</a></>}
    </p>
  )
}
