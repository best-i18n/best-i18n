# best-i18n Nuxt playground

The same app as [`playground/sveltekit`](../sveltekit#readme) - same two pages,
same URL shape - on [Nuxt 4](https://nuxt.com/), through the `best-i18n/nuxt`
module.

```bash
pnpm --filter best-i18n build     # the playground consumes the built package
pnpm --filter playground-nuxt dev
```

Then open http://localhost:3000 and http://localhost:3000/zh.

## What the module does

`nuxt.config.ts` lists `best-i18n/nuxt` and a `bestI18n` block with the
locales. The module then:

- adds the Vite plugin with `vue: true`, so `.vue` components and `.ts`
  composables are both compiled and both read the locale through
  `best-i18n/vue`;
- adds a copy of every page under each non-base locale prefix, so `/zh/about`
  is a real route and nothing is rewritten at request time;
- turns on Nuxt's `experimental.asyncContext` and installs a Nitro plugin that
  resolves the locale per request - URL prefix, cookie, `Accept-Language` -
  and hands it to every `getLocale()` in that request through Nitro's async
  context;
- installs a Nuxt plugin that stamps `<html lang>` on the server and reads it
  back on the client before hydration.

Nothing in the pages is Nuxt-specific: `t` from `best-i18n/macro`, `<Trans>`
from `best-i18n/vue/macro`, `useLocale()` from `best-i18n/vue`.

## Messages

```bash
pnpm --filter playground-nuxt extract
```

## Per-locale build

```bash
pnpm --filter playground-nuxt build:zh
```

Every message collapses to a Chinese literal, and the server answers every
request in Chinese.

## Size

All client JavaScript, gzipped, from `pnpm bench` (`node scripts/bench-size.mjs --family Nuxt`):

| variant                            | client JS | raw      |
| ---------------------------------- | --------- | -------- |
| best-i18n                          | 73.7 kB   | 199.0 kB |
| best-i18n, `I18N_STATIC_LOCALE=zh` | 73.5 kB   | 198.5 kB |
| @nuxtjs/i18n                       | 100.5 kB  | 279.3 kB |
