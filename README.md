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
every `/_next/static/*.js` the HTML of `/zh`, `/zh/about` and `/zh/long`
references; on TanStack Start they are the emitted client assets, because
Start hands the client entry over through a manifest rather than a script tag.

`/zh/long` is the text-heavy case: a deliberately long article of ~30
server-rendered messages, most of them full paragraphs, mirrored across both
Next twins - plurals, context and markup included.

### Next.js

| variant                            | client JS (gzip) | raw      | HTML /zh (gzip) | HTML /zh/long (gzip) |
| ---------------------------------- | ---------------- | -------- | --------------- | -------------------- |
| no i18n at all                     | 173.4 kB         | 562.0 kB | 1.9 kB          | -                    |
| best-i18n                          | 174.3 kB         | 564.9 kB | 2.4 kB          | 5.0 kB               |
| best-i18n, `I18N_STATIC_LOCALE=zh` | 174.2 kB         | 564.7 kB | 2.4 kB          | 5.0 kB               |
| next-intl                          | 187.4 kB         | 607.4 kB | 4.9 kB          | 5.5 kB               |

### TanStack Start

| variant                            | client JS (gzip) | raw      |
| ---------------------------------- | ---------------- | -------- |
| best-i18n                          | 99.1 kB          | 310.3 kB |
| best-i18n, `I18N_STATIC_LOCALE=zh` | 98.8 kB          | 309.7 kB |
| paraglide                          | 106.9 kB         | 334.9 kB |

The first row of the Next table is the same app with every message replaced by
a literal. It is measured by hand rather than by `pnpm bench`, since there is
no fourth playground for it - and it predates the `/long` page, hence the dash.

The two HTML columns tell the story. Both home pages render the same handful
of messages, yet `/zh` reads 2.4 kB against 4.9 kB: the difference is the
catalog, which next-intl ships in every page's payload whether the page
renders those messages or not. best-i18n's pages carry only the text they
render - the ~30 long-page messages exist as HTML on `/zh/long` and nowhere
else, client JS included. The long page itself is close on both (5.0 kB
against 5.5 kB): a page that actually renders the text pays for the text,
whoever compiled it.

### What the two gaps are made of

They are not the same kind of gap, and the difference matters more than the
numbers.

**next-intl's ~13 kB is a message runtime** - an ICU formatter, the catalog and
the lookup. It buys plurals, select, dates, numbers and rich text. best-i18n
has since grown plurals of its own - gettext plurals, compiled to an inlined
per-locale formula rather than an ICU runtime - but select, dates and numbers
it still does not do. Its catalog also travels in _every_ page's HTML by
default: `/zh` renders none of the `/long` page's ~30 messages and still
carries all of them - the 4.9 kB against best-i18n's 2.4 kB in the table
above.

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

## Thanks

The ideas here are inherited, not invented: [GNU
gettext](https://www.gnu.org/software/gettext/) for the PO workflow,
[Lingui](https://lingui.dev/) for the macro shape and the `<0>...</0>` markup
convention, [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJS)
for proving compile-time i18n with per-locale tree-shaking, and
[next-intl](https://next-intl.dev/) as the reference for a complete Next.js
integration. The last two also serve as the honest halves of the size
comparison above. The full list lives in
[`packages/best-i18n`](./packages/best-i18n#thanks).
