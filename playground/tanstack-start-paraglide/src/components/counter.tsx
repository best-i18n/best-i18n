import { useState } from 'react'

import { m } from '@/paraglide/messages'

export function Counter() {
  const [count, setCount] = useState(0)

  return (
    <p>
      <button type='button' onClick={() => setCount(count + 1)}>
        {m.add_one()}
      </button>{' '}
      {m.you_have_items({ count })}
    </p>
  )
}
