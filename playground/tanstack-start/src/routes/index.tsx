import { createFileRoute } from '@tanstack/react-router'
import { t } from 'best-i18n/macro'

import { Counter } from '@/components/counter'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <>
      <h1>{t`A small starter with room to grow.`}</h1>
      <p>{t`This paragraph was rendered on the server.`}</p>
      <Counter />
    </>
  )
}
