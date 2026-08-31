import { createFileRoute } from '@tanstack/react-router'

import { Counter } from '@/components/counter'
import { m } from '@/paraglide/messages'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <>
      <h1>{m.starter()}</h1>
      <p>{m.rendered_on_server()}</p>
      <Counter />
    </>
  )
}
