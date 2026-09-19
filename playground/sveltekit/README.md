# best-i18n SvelteKit playground

The same app as [`playground/tanstack-start`](../tanstack-start#readme) - same
two pages, same URL shape - on [SvelteKit](https://svelte.dev/docs/kit/introduction).

```bash
pnpm --filter best-i18n build     # the playground consumes the built package
pnpm --filter playground-sveltekit dev
```

Then open http://localhost:3000 and http://localhost:3000/zh.

## Nothing here is SvelteKit-specific in the library

The library ships no SvelteKit integration: this app uses the plain Vite
plugin and the plain server binding, which is all a Vite-based framework
needs. `svelte: true` is the one extra plugin option, because compiling
`.svelte` files needs the `svelte` package.

| File                  | What it uses                                                             |
| --------------------- | ------------------------------------------------------------------------ |
| `vite.config.ts`      | `i18n({ svelte: true })` from `best-i18n/vite`, **before** `sveltekit()` |
| `src/hooks.server.ts` | `withRequestLocale` from `best-i18n/server`                              |
| `src/hooks.ts`        | `reroute` strips `/zh` so the route tree stays unprefixed                |
| `src/hooks.client.ts` | `resolveClientLocale` / `setLocale` before hydration                     |
| `src/routes/*`        | `t` from `best-i18n/macro`; `<Trans>` from `best-i18n/svelte/macro`; `$derived` for reactive script text |

Two of those deserve a note.

**`withRequestLocale` around the whole request.** SvelteKit hands over the
request in `handle`, so the render really can be wrapped in AsyncLocalStorage.
`getLocale()` is then correct everywhere below it with no per-component call.
`reroute` in `src/hooks.ts` strips the locale prefix so the route tree stays
unprefixed: `/zh/about` still renders `src/routes/about`. Links go the other
way through `href()` in `$lib/href.svelte.ts`.

**Runes, not `useI18n`.** Svelte has no React. Compiled messages subscribe
through `best-i18n/svelte`. Markup `{t\`...\`}` updates on a locale change;
script text that should follow the locale needs `$derived(t\`...\`)`. Markup
inside a sentence uses `<Trans>` from `best-i18n/svelte/macro` — same
placeholders as the React macro, rebuilt to Svelte markup rather than JSX.

## Messages

```bash
pnpm --filter playground-sveltekit extract
```

## Per-locale build

```bash
pnpm --filter playground-sveltekit build:zh
```

Every message collapses to a Chinese literal: no locale branch, no `getLocale`
in the client assets, no English anywhere in the output.
