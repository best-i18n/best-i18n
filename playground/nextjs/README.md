# best-i18n Next.js playground

App Router with a `[locale]` segment, and the base locale unprefixed: `/about`
is English, `/zh/about` is Chinese, `/en/about` redirects to `/about`. Both
locales are statically prerendered.

```bash
pnpm --filter best-i18n build     # the playground consumes the built package
pnpm --filter playground-nextjs dev
```

Then open http://localhost:3000 and http://localhost:3000/zh.

## What is wired where

| File                          | Role                                                  |
| ----------------------------- | ----------------------------------------------------- |
| `src/i18n.ts`                 | the locales and URL shape, in one place               |
| `src/proxy.ts`                | points a public URL at the `[locale]` segment         |
| `next.config.ts`              | installs the loader that compiles `t` away            |
| `src/app/[locale]/layout.tsx` | one `getLocale()` call, plus `LocaleProvider`         |
| `src/components/*`            | client components: `useT`, localized `Link`, switcher |

`t` needs nothing per file: the locale is the route param, read synchronously,
so a Server Component resolves it during a static prerender too.

## Messages

```bash
pnpm --filter playground-nextjs extract   # rewrites messages/*.po
```

Then fill in the empty `msgstr` in `messages/zh.po`.

## Per-locale build

```bash
pnpm --filter playground-nextjs build:zh
```

Every message collapses to a plain Chinese literal - no locale branch, no
runtime lookup, and no English left in the output.

## Size

A next-intl build of this same app lives in
[`playground/nextjs-intl`](../nextjs-intl#readme), with the numbers and
`pnpm bench` to reproduce them.
