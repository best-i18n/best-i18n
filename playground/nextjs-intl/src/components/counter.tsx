'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

export function Counter() {
  const t = useTranslations('Counter')
  const [count, setCount] = useState(0)

  return (
    <p>
      <button type='button' onClick={() => setCount(count + 1)}>
        {t('add')}
      </button>{' '}
      {t('items', { count })}
    </p>
  )
}
