import { useI18n } from 'best-i18n/react/macro'
import { useState } from 'react'

/**
 * `const t = useI18n()` compiles to `const t = useLocale()`, so the strings
 * stay inlined while the component re-renders on a locale change.
 */
export function Counter() {
  const t = useI18n()
  const [count, setCount] = useState(0)

  return (
    <p>
      <button type='button' onClick={() => setCount(count + 1)}>
        {t`Add one`}
      </button>{' '}
      {t`You have ${count} items`}
    </p>
  )
}
