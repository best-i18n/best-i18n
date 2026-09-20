// oxlint-disable react/no-unstable-nested-components -- Solid components run once.
import { Router } from '@solidjs/router'
import { FileRoutes } from '@solidjs/start/router'
import { Suspense } from 'solid-js'
import LocaleSwitcher from './locale-switcher.tsx'
import { m } from './paraglide/messages'
import { deLocalizeUrl, localizeHref } from './paraglide/runtime'
import './app.css'

export default function App() {
  return (
    <Router
      // `/zh/about` matches `routes/about.tsx`; the address bar is unchanged.
      // deLocalizeUrl wants an absolute URL; the origin is discarded.
      transformUrl={(pathname) =>
        deLocalizeUrl(new URL(pathname, 'http://localhost')).pathname
      }
      root={(props) => (
        <main>
          <nav>
            <a href={localizeHref('/')}>{m.home()}</a>
            <a href={localizeHref('/about')}>{m.about()}</a>
            <LocaleSwitcher />
          </nav>
          <Suspense>{props.children}</Suspense>
        </main>
      )}
    >
      <FileRoutes />
    </Router>
  )
}
