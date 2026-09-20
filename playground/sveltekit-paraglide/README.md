# Paraglide on SvelteKit

The same app as [`playground/sveltekit`](../sveltekit#readme) - same two pages,
same messages, same English/Chinese copy, same URL shape - built with
[Paraglide JS](https://paraglidejs.com/sveltekit), SvelteKit's recommended
i18n library, instead of best-i18n.

```bash
pnpm --filter playground-sveltekit-paraglide dev
```

Paraglide compiles `messages/*.json` into one function per message
(`m.starter()`), resolves the locale from the URL, a cookie or
`Accept-Language`, and binds it per request in `hooks.server.ts` through
`paraglideMiddleware`. `reroute` strips the `/zh` prefix with
`deLocalizeUrl`, links are built with `localizeHref`, and `setLocale()`
navigates to the localized URL, so nothing needs to be reactive.

A sentence with a link in it has to be split into three messages by hand;
compare `src/routes/about/+page.svelte` with the `<Trans>` in the best-i18n
playground.

## Size

All client JavaScript, gzipped, from `pnpm bench` (`node scripts/bench-size.mjs --family SvelteKit`):

| variant                            | client JS | raw      |
| ---------------------------------- | --------- | -------- |
| best-i18n                          | 32.1 kB   | 79.3 kB  |
| best-i18n, `I18N_STATIC_LOCALE=zh` | 31.5 kB   | 78.2 kB  |
| paraglide                          | 39.3 kB   | 102.8 kB |
| svelte-i18n                        | 49.4 kB   | 136.7 kB |

The 7 kB between best-i18n and paraglide is one chunk: the `URLPattern`
matcher and the cookie and `preferredLanguage` strategies. It is a runtime
for routing, not for messages - on the message side both libraries inline
and tree-shake.
