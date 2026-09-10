import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import { getLocale } from 'best-i18n/runtime'

import { SiteHeader } from '@/components/site-header'

import appCss from '@/styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'best-i18n · TanStack Start' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
})

function RootComponent() {
  // On the server this reads the locale bound for this request; on the client,
  // the one resolved before hydration. Same call, same answer.
  const locale = getLocale()

  return (
    <html lang={locale}>
      <head>
        <HeadContent />
      </head>
      <body>
        <SiteHeader />
        <main>
          <Outlet />
        </main>
        <Scripts />
      </body>
    </html>
  )
}
