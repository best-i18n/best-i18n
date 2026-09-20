import { createSignal } from 'solid-js'
import { m } from '../paraglide/messages'

export default function Home() {
  const [count, setCount] = createSignal(0)
  return (
    <>
      <h1>{m.starter()}</h1>
      <p>{m.rendered_on_server()}</p>
      <p>
        <button type='button' onClick={() => setCount(count() + 1)}>
          {m.add_one()}
        </button>{' '}
        {m.you_have_items({ count: count() })}
      </p>
    </>
  )
}
