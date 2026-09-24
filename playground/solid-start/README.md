# SolidStart v2

SolidStart 2, Solid 1, Vite 8 and Nitro, with best-i18n macros, reactive locale
reads, request-scoped SSR and locale-prefixed routes (`/`, `/about`, `/zh`,
`/zh/about`). Requires Node 24+.

```sh
pnpm build                 # from the repository root: build best-i18n
pnpm play solid-start
pnpm play solid-start extract
pnpm play solid-start build
pnpm play solid-start start
```

Edit `messages/zh.po` for Chinese translations. `src/i18n.ts` is shared by Vite,
server middleware and the client. The client reads the server’s `<html lang>`
before hydration. The language switcher saves a cookie and navigates to the
localized URL.

`pnpm --filter playground-solid-start build:zh` compiles Chinese only; deploy
per-locale builds behind locale-aware routing. Middleware and `<html lang>`
use that same fixed language.

Solid components execute once. Use JSX, accessors or `createMemo` for changing
translations, for example `` const title = () => t`Hello` ``. Reusable functions
can return these accessors.

## Tests

Run `pnpm test:solid-start` from the repository root to build the package and
run production integration tests for dynamic, English-only and Chinese-only
builds. Tests cover locale resolution from URLs, cookies and Accept-Language,
concurrent SSR, client asset serving and removal of the other locale.

`pnpm --filter best-i18n test solid.test.ts` runs the compiler and runtime
fixtures, including SSR-to-client hydration, reactive updates and cleanup.
