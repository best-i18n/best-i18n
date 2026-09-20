// oxlint-disable react/no-unstable-nested-components -- Solid components run once.
import { Router } from '@solidjs/router'
import { FileRoutes } from '@solidjs/start/router'
import { Suspense } from 'solid-js'
import { getRequestEvent, isServer } from 'solid-js/web'
import { I18nProvider, useI18n } from './i18n/index.tsx'
import { baseLocale, deLocalizePathname, localizePathname } from './i18n/url.ts'
import LocaleSwitcher from './locale-switcher.tsx'
import './app.css'
import type { RouteSectionProps } from '@solidjs/router'
import type { Locale } from './i18n/url.ts'

/** The server decided in middleware; the client reads what the server wrote. */
function initialLocale(): Locale {
  if (isServer) return getRequestEvent()?.locals.locale ?? baseLocale
  return (document.documentElement.lang as Locale) || baseLocale
}

function Shell(props: RouteSectionProps) {
  const { t, locale } = useI18n()
  return (
    <main>
      <nav>
        <a href={localizePathname('/', locale())}>{t('home')}</a>
        <a href={localizePathname('/about', locale())}>{t('about')}</a>
        <LocaleSwitcher />
      </nav>
      <Suspense>{props.children}</Suspense>
    </main>
  )
}

export default function App() {
  return (
    <Router
      // `/zh/about` matches `routes/about.tsx`; the address bar is unchanged.
      transformUrl={deLocalizePathname}
      root={(props) => (
        <I18nProvider locale={initialLocale()}>
          <Suspense>
            <Shell {...props} />
          </Suspense>
        </I18nProvider>
      )}
    >
      <FileRoutes />
    </Router>
  )
}
