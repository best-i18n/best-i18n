import { t, plural } from 'best-i18n/macro'
import { Trans } from 'best-i18n/solid/macro'
import { createSignal } from 'solid-js'

export default function Home() {
  const [count, setCount] = createSignal(0)
  const title = () => t`Hello from SolidStart!`
  return (
    <>
      <h1>{title()}</h1>
      <p>{t`Compile-time translations with SolidStart v2.`}</p>
      <button onClick={() => setCount(count() + 1)}>
        {plural(count(), `One click`, `${count()} clicks`)}
      </button>
      <p>
        <Trans>
          Read the <a href='https://github.com/best-i18n/best-i18n'>README</a>{' '}
          to learn more.
        </Trans>
      </p>
    </>
  )
}
