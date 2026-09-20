# @solid-primitives/i18n on SolidStart

The same app as [`playground/solid-start`](../solid-start#readme) - same two
pages, same messages, same English/Chinese copy, same URL shape - built with
[`@solid-primitives/i18n`](https://primitives.solidjs.community/package/i18n),
the Solid community's i18n primitive, instead of best-i18n.

```bash
pnpm --filter playground-solid-start-primitives dev
```

The primitive is a runtime: `translator(dict, resolveTemplate)` looks keys up
in a flattened dictionary and fills `{{ name }}` templates. Following its
README, the dictionaries are lazy chunks behind `createResource`, so a locale
switch fetches the other one. It brings no locale resolution, routing or
request binding: `src/i18n/url.ts` resolves the locale from the URL, a cookie
or `Accept-Language`, `middleware.ts` stores it on `event.locals`,
`<Router transformUrl>` strips the `/zh` prefix, and a context provider in
`app.tsx` hands `t` and the locale signal to components.

A sentence with a link in it has to be split into three keys by hand; compare
`src/routes/about.tsx` with the `<Trans>` in the best-i18n playground.

## Size

All client JavaScript, gzipped, from `pnpm bench` (`node scripts/bench-size.mjs --family SolidStart`):

| variant                            | client JS | raw     |
| ---------------------------------- | --------- | ------- |
| best-i18n                          | 16.7 kB   | 41.9 kB |
| best-i18n, `I18N_STATIC_LOCALE=zh` | 16.4 kB   | 41.3 kB |
| @solid-primitives/i18n             | 18.2 kB   | 44.8 kB |
| paraglide                          | 26.0 kB   | 69.8 kB |

The primitive itself is small - a flattened lookup plus `{{ }}` templating -
so it lands within 1.5 kB of best-i18n. Its two dictionary chunks are lazy
and both counted, although a visitor downloads one.
