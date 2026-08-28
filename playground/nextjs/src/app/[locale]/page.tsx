import { t } from 'best-i18n/macro'

import { Counter } from '@/components/counter'

/**
 * A Server Component. `t` is compiled away entirely: what ships is a ternary
 * over the request locale, with both translations inlined as literals.
 */
export default function HomePage() {
  return (
    <>
      <h1>{t`A small starter with room to grow.`}</h1>
      <p>{t`This paragraph was rendered on the server.`}</p>
      <Counter />
    </>
  )
}
