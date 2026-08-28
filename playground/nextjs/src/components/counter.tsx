'use client'

import { Trans, useI18n } from 'best-i18n/react/macro'
import { useState } from 'react'

/**
 * A Client Component. `const t = useI18n()` compiles to `const t = useLocale()`,
 * so the strings stay inlined while the component still re-renders when the
 * locale changes.
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
      {' · '}
      {/* Markup inside a Client Component: this <Trans> reads the `t` above,
          so it gets its locale from LocaleProvider like everything else here. */}
      <Trans>
        Counting is <strong>not</strong> translation.
      </Trans>
    </p>
  )
}
