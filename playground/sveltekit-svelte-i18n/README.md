# svelte-i18n on SvelteKit

The same app as [`playground/sveltekit`](../sveltekit#readme) - same two pages,
same messages, same English/Chinese copy, same URL shape - built with
[svelte-i18n](https://github.com/kaisermann/svelte-i18n), the long-standing
store-based library, instead of best-i18n.

```bash
pnpm --filter playground-sveltekit-svelte-i18n dev
```

svelte-i18n formats ICU messages at runtime from JSON dictionaries and keeps
the locale in a Svelte store, read as `$locale` and `$_('key')`. The
dictionaries are registered as loaders, so each locale is its own chunk. The
library has no routing or request binding of its own: `src/lib/i18n/url.ts`
resolves the locale from the URL, a cookie or `Accept-Language`, `hooks.ts`
strips the `/zh` prefix, `hooks.server.ts` sets the store per request - a
global write, which the library's own SvelteKit guide also does and which
concurrent requests in different languages can race on - and `+layout.ts`
mirrors the server's choice on the client before hydration.

A sentence with a link in it has to be split into three keys by hand; compare
`src/routes/about/+page.svelte` with the `<Trans>` in the best-i18n playground.

## Size

All client JavaScript, gzipped, from `pnpm bench` (`node scripts/bench-size.mjs --family SvelteKit`):

| variant                            | client JS | raw      |
| ---------------------------------- | --------- | -------- |
| best-i18n                          | 32.1 kB   | 79.3 kB  |
| best-i18n, `I18N_STATIC_LOCALE=zh` | 31.5 kB   | 78.2 kB  |
| paraglide                          | 39.3 kB   | 102.8 kB |
| svelte-i18n                        | 49.4 kB   | 136.7 kB |

The 17 kB between best-i18n and svelte-i18n is `intl-messageformat` and the
formatjs parser: ICU messages are parsed and formatted in the browser. The
two dictionary chunks are counted too, although a visitor downloads one.
