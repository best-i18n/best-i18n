# Paraglide on SolidStart

The same app as [`playground/solid-start`](../solid-start#readme) - same two
pages, same messages, same English/Chinese copy, same URL shape - built with
[Paraglide JS](https://paraglidejs.com), which is framework-agnostic, instead
of best-i18n.

```bash
pnpm --filter playground-solid-start-paraglide dev
```

Paraglide compiles `messages/*.json` into one function per message
(`m.starter()`), resolves the locale from the URL, a cookie or
`Accept-Language`, and binds it per request through `paraglideMiddleware` in
`src/middleware.ts`. `<Router transformUrl>` strips the `/zh` prefix with
`deLocalizeUrl`, links are built with `localizeHref`, and `setLocale()`
navigates to the localized URL, so nothing needs to be reactive.

A sentence with a link in it has to be split into three messages by hand;
compare `src/routes/about.tsx` with the `<Trans>` in the best-i18n playground.

## Size

All client JavaScript, gzipped, from `pnpm bench` (`node scripts/bench-size.mjs --family SolidStart`):

| variant                            | client JS | raw     |
| ---------------------------------- | --------- | ------- |
| best-i18n                          | 16.7 kB   | 41.9 kB |
| best-i18n, `I18N_STATIC_LOCALE=zh` | 16.4 kB   | 41.3 kB |
| @solid-primitives/i18n             | 18.2 kB   | 44.8 kB |
| paraglide                          | 26.0 kB   | 69.8 kB |

Paraglide's runtime chunk - the `URLPattern` matcher and the cookie and
`preferredLanguage` strategies - is 15.8 kB gzip in this build, against
8.7 kB for the same code inside SvelteKit's shared chunks.
