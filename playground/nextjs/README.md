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

## SEO

`generateMetadata` runs inside the same render as the page, so `t` works there
with no setup - and the title is compiled away per locale exactly like the body
copy:

```tsx
export function generateMetadata(): Metadata {
  return {
    title: t`best-i18n - compile-time internationalization`,
    description: t`Translations inlined at the call site…`,
    alternates: localeAlternates('/'),
  }
}
```

`src/seo.ts` builds `canonical` and the `hreflang` set from the route as it is
authored - `/about`, unprefixed - using the same `localizePathname` the
navigation helpers use, so nothing there has to know Chinese lives under `/zh`:

```html
<link rel="canonical" href="https://…/zh/about" />
<link rel="alternate" hreflang="en" href="https://…/about" />
<link rel="alternate" hreflang="zh" href="https://…/zh/about" />
<link rel="alternate" hreflang="x-default" href="https://…/about" />
```

Relative alternates need `metadataBase`, which the layout sets.

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
