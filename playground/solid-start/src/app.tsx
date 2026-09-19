// oxlint-disable react/no-unstable-nested-components -- Solid components run once.
import { Router } from '@solidjs/router'
import { FileRoutes } from '@solidjs/start/router'
import { switchLocale } from 'best-i18n/client'
import { localizePathname } from 'best-i18n/locale-url'
import { t } from 'best-i18n/macro'
import { getLocale } from 'best-i18n/solid'
import { Suspense } from 'solid-js'
import { i18n } from './i18n.ts'
import './app.css'

export default function App() {
  return (
    <Router
      root={(props) => (
        <main>
          <nav>
            <a href={localizePathname('/', getLocale(), i18n)}>{t`Home`}</a>
            <a
              href={localizePathname('/about', getLocale(), i18n)}
            >{t`About`}</a>
            <button
              onClick={() =>
                switchLocale(getLocale() === 'en' ? 'zh' : 'en', i18n)
              }
            >
              English / 中文
            </button>
          </nav>
          <Suspense>{props.children}</Suspense>
        </main>
      )}
    >
      <FileRoutes />
    </Router>
  )
}
