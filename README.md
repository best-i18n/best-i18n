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
playground/tanstack-start-paraglide the same app in Paraglide
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

## Playgrounds

Four apps, the same two pages, the same messages, the same URLs - so a
comparison is between libraries rather than between apps.

|                                                                                       |                                     |
| ------------------------------------------------------------------------------------- | ----------------------------------- |
| [`playground/nextjs`](./playground/nextjs#readme)                                     | best-i18n on the Next.js App Router |
| [`playground/nextjs-intl`](./playground/nextjs-intl#readme)                           | the same app in next-intl           |
| [`playground/tanstack-start`](./playground/tanstack-start#readme)                     | best-i18n on the plain Vite plugin  |
| [`playground/tanstack-start-paraglide`](./playground/tanstack-start-paraglide#readme) | the same app in Paraglide           |

```bash
pnpm build          # the playgrounds consume the built package
pnpm dev:next       # http://localhost:3000 and /zh
pnpm dev:tanstack
pnpm dev:paraglide
```

## Size

```bash
pnpm build && pnpm bench
```

Two families, measured two ways - both apps in a family go through the same
method, which is what makes a table mean something. On Next.js the numbers are
every `/_next/static/*.js` the HTML of `/zh` and `/zh/about` references; on
TanStack Start they are the emitted client assets, because Start hands the
client entry over through a manifest rather than a script tag.

### Next.js

| variant                            | client JS (gzip) | raw      | HTML /zh (gzip) |
| ---------------------------------- | ---------------- | -------- | --------------- |
| no i18n at all                     | 173.4 kB         | 562.0 kB | 1.9 kB          |
| best-i18n                          | 174.2 kB         | 564.6 kB | 2.1 kB          |
| best-i18n, `I18N_STATIC_LOCALE=zh` | 174.1 kB         | 564.4 kB | 2.1 kB          |
| next-intl                          | 187.4 kB         | 607.4 kB | 2.4 kB          |

### TanStack Start

| variant                            | client JS (gzip) | raw      |
| ---------------------------------- | ---------------- | -------- |
| best-i18n                          | 99.0 kB          | 310.2 kB |
| best-i18n, `I18N_STATIC_LOCALE=zh` | 98.8 kB          | 309.7 kB |
| paraglide                          | 106.9 kB         | 334.9 kB |

The first row of the Next table is the same app with every message replaced by
a literal. It is measured by hand rather than by `pnpm bench`, since there is
no fourth playground for it.

### What the two gaps are made of

They are not the same kind of gap, and the difference matters more than the
numbers.

**next-intl's ~13 kB is a message runtime** - an ICU formatter, the catalog and
the lookup. It buys plurals, select, dates, numbers and rich text, none of
which best-i18n does yet. Its catalog also travels in _every_ page's HTML by
default: adding 300 messages nobody on the home page renders still grew that
page from 2.4 kB to 4.4 kB gzip.

**paraglide's ~8 kB is a URL router** - a `URLPattern` matcher, cookie
handling, `preferredLanguage` detection - not message lookup. On the message
side both libraries inline and tree-shake, so the gap is fixed rather than
growing with the catalog. What it buys is real: paraglide can translate the
path itself, `/about` becoming `/de/ueber`, which best-i18n cannot do at all.

### Where best-i18n costs more

Messages are inlined at each call site, so a message used many times _in one
module_ is emitted many times, where paraglide emits one function and calls it.
One message used 100 times: +17.6 kB raw here against +3.7 kB there - and
**+0.5 kB gzip either way**, because gzip flattens the repetition. Over the
wire it is a wash; what is left is parse time.

Scaling on the message side was measured too, at 300 extra messages: rendered
from a Server Component they cost best-i18n no client JS at all, and from a
Client Component about 6 bytes each gzipped for both languages.
[`playground/nextjs-intl`](./playground/nextjs-intl#readme) and
[`playground/tanstack-start-paraglide`](./playground/tanstack-start-paraglide#readme)
carry the full numbers and the caveats.
