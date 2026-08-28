# best-i18n

Compile-time i18n: the source text is the message, every translation is inlined
at the call site, and a per-locale build collapses to plain string literals.

This is the monorepo. The package and its documentation live in
[`packages/best-i18n`](./packages/best-i18n#readme).

```text
packages/best-i18n     the package
  src/compiler/        parser, transform, PO reading and merging
  src/runtime/         locale at runtime: isomorphic, plus the Node server half
  src/react/           useLocale, LocaleProvider, the useI18n and Trans macros
  src/integrations/    one folder per framework - vite, next
  src/cli/             i18n-extract, i18n-compile
  spike/               builds a fixture twice and asserts on the real bundles
playground/nextjs      Next.js App Router, both locales, end to end
playground/nextjs-intl the same app in next-intl, for size comparison
playground/tanstack-start the same app on the plain Vite plugin
scripts/bench-size.mjs builds each playground and weighs what a browser loads
```

A new framework is a new folder under `src/integrations` plus its subpath in
`exports`; nothing in `compiler` or `runtime` should have to know about it.

## Working on it

```bash
pnpm install
pnpm build          # the playground consumes the built package
pnpm test
pnpm typecheck
pnpm lint
pnpm spike          # bundle-level assertions, not transform output
pnpm bench          # client JS a browser downloads, best-i18n vs next-intl
```

## Playground

```bash
pnpm build
pnpm dev:next       # Next.js       - http://localhost:3000 and /zh
pnpm dev:tanstack   # TanStack Start - same app, same URLs
```

See [`playground/nextjs`](./playground/nextjs#readme) for what it exercises and
how the per-locale build is checked, and
[`playground/nextjs-intl`](./playground/nextjs-intl#readme) for the same app in
next-intl and what the size difference does and does not mean.

| variant        | client JS (gzip) | vs. no i18n |
| -------------- | ---------------- | ----------- |
| no i18n at all | 173.4 kB         | -           |
| best-i18n      | 174.1 kB         | +0.7 kB     |
| next-intl      | 187.4 kB         | +14.0 kB    |
