// oxlint-disable react/only-export-components -- SolidStart server handler entry.
import { createHandler, StartServer } from '@solidjs/start/server'
import { getRequestEvent } from 'solid-js/web'
import { baseLocale } from './i18n/url.ts'

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang={getRequestEvent()?.locals.locale ?? baseLocale}>
        <head>
          <meta charset='utf-8' />
          <meta name='viewport' content='width=device-width, initial-scale=1' />
          {assets}
        </head>
        <body>
          <div id='app'>{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
))
