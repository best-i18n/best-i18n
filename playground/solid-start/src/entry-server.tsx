// oxlint-disable react/only-export-components -- SolidStart server handler entry.
import { createHandler, StartServer } from '@solidjs/start/server'
import { getLocale } from 'best-i18n/solid'

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang={getLocale()}>
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
