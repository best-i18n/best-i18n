# @apps/website

The best-i18n documentation site — [Next.js](https://nextjs.org) +
[Fumadocs](https://fumadocs.dev), statically exported (`output: 'export'`),
bilingual (en + zh).

```bash
pnpm --filter @apps/website dev       # or: pnpm dev:website (repo root)
pnpm --filter @apps/website build     # static export to out/
pnpm --filter @apps/website start     # serve out/ locally
pnpm --filter @apps/website extract   # re-extract landing-page messages to messages/
```

## How the two i18n layers split

- **Docs content** (`content/docs/*.mdx`) goes through fumadocs' own i18n:
  `page.zh.mdx` next to `page.mdx`, `meta.zh.json` next to `meta.json`,
  locale routing under `/[lang]` (`src/lib/i18n.ts`). A missing zh page falls
  back to the English one. UI chrome translations live in
  `src/lib/layout.shared.tsx`.
- **The landing page dogfoods best-i18n itself**: `t` macros in
  `src/app/[lang]/(home)/page.tsx`, compiled by `createI18nPlugin` in
  `next.config.mjs`, catalogs in `messages/` (`src/lib/best-i18n.ts` binds the
  `lang` route param). After changing its strings, run `pnpm extract` and fill
  `messages/zh.po`.

Search runs client-side against a prebuilt index exported as a static file
(`/api/search`); the default multilingual tokenizer covers Chinese, so the
whole site works from any static host. The bare root URL is a locale redirect
written by `scripts/postbuild.mjs`.
