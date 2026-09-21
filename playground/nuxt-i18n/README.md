# @nuxtjs/i18n playground

The same app as [`playground/nuxt`](../nuxt#readme) - same two pages, same
messages, same English/Chinese copy, same URL shape - built with
[`@nuxtjs/i18n`](https://i18n.nuxtjs.org/), the Nuxt module over vue-i18n,
instead of best-i18n.

```bash
pnpm --filter playground-nuxt-i18n dev
```

Messages are JSON dictionaries under `i18n/locales`, formatted at runtime by
vue-i18n and read as `$t('key')`. `strategy: 'prefix_except_default'` gives
the same URLs as the other playgrounds, `useLocalePath()` builds links and
`setLocale()` switches; the module resolves the locale from the URL, a cookie
and `Accept-Language`, redirecting `/` when they disagree.

A sentence with a link in it is split into three keys by hand; compare
`app/pages/about.vue` with the `<Trans>` in the best-i18n playground.

## Size

All client JavaScript, gzipped, from `pnpm bench` (`node scripts/bench-size.mjs --family Nuxt`):

| variant                            | client JS | raw      |
| ---------------------------------- | --------- | -------- |
| best-i18n                          | 73.7 kB   | 199.0 kB |
| best-i18n, `I18N_STATIC_LOCALE=zh` | 73.5 kB   | 198.5 kB |
| @nuxtjs/i18n                       | 100.5 kB  | 279.3 kB |

The 27 kB between best-i18n and @nuxtjs/i18n is vue-i18n's message compiler
and formatter - `$t('key', { count })` is parsed and formatted in the browser -
plus the module's routing and browser-language detection runtime. Both apps
share the same Nuxt, Vue and router code; the difference is the i18n layer.
