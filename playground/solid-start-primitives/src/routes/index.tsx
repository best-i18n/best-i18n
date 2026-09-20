import { createSignal } from 'solid-js'
import { useI18n } from '../i18n/index.tsx'

export default function Home() {
  const { t } = useI18n()
  const [count, setCount] = createSignal(0)
  return (
    <>
      <h1>{t('starter')}</h1>
      <p>{t('rendered_on_server')}</p>
      <p>
        <button type='button' onClick={() => setCount(count() + 1)}>
          {t('add_one')}
        </button>{' '}
        {t('you_have_items', { count: count() })}
      </p>
    </>
  )
}
