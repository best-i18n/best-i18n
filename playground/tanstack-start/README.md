# best-i18n TanStack Start playground

The same app as [`playground/nextjs`](../nextjs#readme) - same two pages, same
eight messages, same URL shape - on TanStack Start.

```bash
pnpm --filter best-i18n build     # the playground consumes the built package
pnpm --filter playground-tanstack-start dev
```

Then open http://localhost:3000 and http://localhost:3000/zh.

## Nothing here is TanStack-specific

That is the point of it. The library ships no TanStack integration: this app
uses the plain Vite plugin and the plain server binding, which is all a
Vite-based framework needs.

| File             | What it uses                                                              |
| ---------------- | ------------------------------------------------------------------------- |
| `vite.config.ts` | `i18n()` from `best-i18n/vite` - the same plugin as any Vite app          |
| `src/start.ts`   | `withRequestLocale` from `best-i18n/server`, as global request middleware |
| `src/router.tsx` | `deLocalizeUrl` / `localizeUrl` as the router's `rewrite` pair            |
| `src/routes/*`   | `t` from `best-i18n/macro`, nothing else                                  |

Two of those deserve a note.

**`withRequestLocale` around the whole request.** TanStack Start hands over the
request handler, so the render really can be wrapped in AsyncLocalStorage.
`getLocale()` is then correct everywhere below it - route components, loaders,
server functions - with no per-component call and no async. This is the case
the library was designed around; Next.js needed its own integration precisely
because it does not hand that handler over.

**The router's `rewrite` pair carries the locale prefix.** The route tree is
authored without one: the prefix is stripped on the way in and put back on the
way out, so a plain `<Link to="/about">` renders `/zh/about` while Chinese is
active. No custom Link, no locale prop.

## Messages

```bash
pnpm --filter playground-tanstack-start extract
```

## Per-locale build

```bash
pnpm --filter playground-tanstack-start build:zh
```

Every message collapses to a Chinese literal: no locale branch, no `getLocale`
in the client assets, no English anywhere in the output.
