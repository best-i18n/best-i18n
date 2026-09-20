'use client'

export function Email({ to }: { to: string }) {
  return (
    <>
      <h1>{(to === "zh" ? `关于` : `About`)}</h1>
      <p>
        {<>{`说`}<b>{`你好`}</b></>}
      </p>
    </>
  )
}
