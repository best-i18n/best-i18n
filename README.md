# best-i18n

Compile-time i18n: the source text is the message, every translation is inlined
at the call site, and a per-locale build collapses to plain string literals.

This is the monorepo. The package and its documentation live in
[`packages/best-i18n`](./packages/best-i18n#readme). A neighbouring problem -
the default locale served unprefixed from a Next.js static export - is solved
by [`@best-i18n/next-unprefixed-locale`](https://github.com/best-i18n/next-unprefixed-locale#readme),
which lives in its own repository and depends on nothing here.

```text
packages/best-i18n     the package
  src/compiler/        analysis, emission, the framework adapter seam, PO reading and merging
  src/runtime/         locale at runtime: isomorphic, plus the Node server half
  src/frameworks/      one directory per framework: runtime entry (index.ts),
                       macros (macro.ts) and the compiler adapter (compiler.ts)
                       for react, svelte and solid
  src/integrations/    one per bundler or meta-framework - vite, rolldown, next
  src/cli/             i18n-extract, i18n-compile
  spike/               builds a fixture twice and asserts on the real bundles
apps/website                         the docs site: Next.js and fumadocs, deployed to Cloudflare
playground/nextjs                    Next.js App Router, both locales, end to end
playground/nextjs-intl               the same app in next-intl, for size comparison
playground/tanstack-start            the same app on the plain Vite plugin
playground/tanstack-start-paraglide  the same app in Paraglide
playground/sveltekit                 the same app on SvelteKit
playground/sveltekit-paraglide       the same app in Paraglide
playground/sveltekit-svelte-i18n     the same app in svelte-i18n
playground/solid-start               the same app on SolidStart v2
playground/solid-start-paraglide     the same app in Paraglide
playground/solid-start-primitives    the same app in @solid-primitives/i18n
playground/nuxt                      the same app on Nuxt 4, through best-i18n/nuxt
playground/nuxt-i18n                 the same app in @nuxtjs/i18n
scripts/bench-size.mjs               builds each playground and weighs what a browser loads
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

Twelve playgrounds cover Next.js, TanStack Start, SvelteKit, SolidStart and
Nuxt. In
each family the apps share the same two pages, the same messages and the same
URLs, so a comparison is between libraries rather than between apps.

|                                                                                       |                                        |
| ------------------------------------------------------------------------------------- | -------------------------------------- |
| [`playground/nextjs`](./playground/nextjs#readme)                                     | best-i18n on the Next.js App Router    |
| [`playground/nextjs-intl`](./playground/nextjs-intl#readme)                           | the same app in next-intl              |
| [`playground/tanstack-start`](./playground/tanstack-start#readme)                     | best-i18n on the plain Vite plugin     |
| [`playground/tanstack-start-paraglide`](./playground/tanstack-start-paraglide#readme) | the same app in Paraglide              |
| [`playground/sveltekit`](./playground/sveltekit#readme)                               | best-i18n on SvelteKit                 |
| [`playground/sveltekit-paraglide`](./playground/sveltekit-paraglide#readme)           | the same app in Paraglide              |
| [`playground/sveltekit-svelte-i18n`](./playground/sveltekit-svelte-i18n#readme)       | the same app in svelte-i18n            |
| [`playground/solid-start`](./playground/solid-start#readme)                           | best-i18n on SolidStart v2             |
| [`playground/solid-start-paraglide`](./playground/solid-start-paraglide#readme)       | the same app in Paraglide              |
| [`playground/solid-start-primitives`](./playground/solid-start-primitives#readme)     | the same app in @solid-primitives/i18n |
| [`playground/nuxt`](./playground/nuxt#readme)                                         | best-i18n on Nuxt 4                    |
| [`playground/nuxt-i18n`](./playground/nuxt-i18n#readme)                               | the same app in @nuxtjs/i18n           |

```bash
pnpm build          # the playgrounds consume the built package
pnpm dev:next       # http://localhost:3000 and /zh
pnpm dev:tanstack
pnpm dev:sveltekit
pnpm dev:solid-start
pnpm dev:nuxt
pnpm dev:paraglide
```

Every playground has a `dev` script: `pnpm --filter playground-<name> dev`.

## Size

```bash
pnpm build && pnpm bench
```

Four framework families, measured two ways - variants in a family use the same
method, which is what makes a table mean something. On Next.js the numbers are
every `/_next/static/*.js` the HTML of `/zh`, `/zh/about` and `/zh/long`
references; on TanStack Start they are the emitted client assets, because
Start hands the client entry over through a manifest rather than a script tag.
SvelteKit includes all JavaScript under `.svelte-kit/output/client`; SolidStart
v2 includes all JavaScript under `.output/public/_build`. Each has its own
table with dynamic and `staticLocale=zh` builds. Framework totals include
framework code and different example content, so compare variants within a
family.

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

### SvelteKit

| variant                            | client JS (gzip) | raw      |
| ---------------------------------- | ---------------- | -------- |
| best-i18n                          | 32.1 kB          | 79.3 kB  |
| best-i18n, `I18N_STATIC_LOCALE=zh` | 31.5 kB          | 78.2 kB  |
| paraglide                          | 39.3 kB          | 102.8 kB |
| svelte-i18n                        | 49.4 kB          | 136.7 kB |

All JavaScript under `.svelte-kit/output/client`. Paraglide's extra 7 kB is
one chunk: its `URLPattern` matcher and the cookie and `preferredLanguage`
strategies - a routing runtime, not a message runtime. svelte-i18n's extra
17 kB is `intl-messageformat` with the formatjs parser, because it formats
ICU messages in the browser, plus one dictionary chunk per locale.

### SolidStart v2

| variant                            | client JS (gzip) | raw     |
| ---------------------------------- | ---------------- | ------- |
| best-i18n                          | 16.7 kB          | 41.9 kB |
| best-i18n, `I18N_STATIC_LOCALE=zh` | 16.4 kB          | 41.3 kB |
| @solid-primitives/i18n             | 18.2 kB          | 44.8 kB |
| paraglide                          | 26.0 kB          | 69.8 kB |

All JavaScript under `.output/public/_build`. `@solid-primitives/i18n` is a
small lookup-and-template runtime, so it lands within 1.5 kB of best-i18n;
its two lazy dictionary chunks are counted even though a visitor downloads
one. Paraglide's runtime chunk is 15.8 kB gzip here against 8.7 kB in the
SvelteKit build - the same code, bundled without SvelteKit's chunk sharing.

### Nuxt 4

| variant                            | client JS (gzip) | raw      |
| ---------------------------------- | ---------------- | -------- |
| best-i18n                          | 73.7 kB          | 199.0 kB |
| best-i18n, `I18N_STATIC_LOCALE=zh` | 73.5 kB          | 198.5 kB |
| @nuxtjs/i18n                       | 100.5 kB         | 279.3 kB |

All JavaScript under `.output/public/_nuxt`. @nuxtjs/i18n's extra 27 kB is
vue-i18n: the message compiler and formatter that turn `$t('key', { count })`
into text in the browser, plus the module's own routing and detection
runtime. best-i18n ships neither, so the gap is the whole of what a message
runtime weighs on Nuxt.

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

Messages are inlined at each call site. Within one module, repeats collapse:
the call sites of a repeated message share one hoisted module-level function -
paraglide's shape - so its translations are emitted once per module (asserted
on the real bundle by `pnpm spike`). Across modules each module carries its
own copy, because the transform is per-file by design; gzip flattens that
repetition (measured at **+0.5 kB gzip** for one message used 100 times,
inlined or hoisted alike), so over the wire it is a wash and what remains is
parse time.

**Why there is no cross-module dedup.** It is possible — a virtual module
holding one function per message, imported by every call site, roughly the
shape of Paraglide's generated `messages/` directory. Three things argue
against it here.

The transform is handed one file at a time. Vite's and Rolldown's `transform`
hooks and the Next.js loader all pass a single module with no view of the
graph, so a shared module means either a codegen pass that writes files before
the build, or a virtual module every message-using file has to import. Both
give up what keeps the current design simple: a compiled module is
self-contained, and nothing has to run before the bundler does.

It also would not dedup across the boundary that matters. On the App Router
the server and client module graphs are separate, so a message rendered on
both sides gets its own copy in each of them either way.

And the win is not really there. Repeats within a module already collapse into
one hoisted function; across modules gzip flattens the rest. What is left is
parse time on duplicated string literals — not obviously worth a build-graph
edge into every module in the app.

The hoisted function is already the shape such a module would export, so if an
app turns up where this costs something measurable, it is a contained change
rather than a redesign.

Scaling on the message side was measured too, at 300 extra messages: rendered
from a Server Component they cost best-i18n no client JS at all, and from a
Client Component about 6 bytes each gzipped for both languages.
[`playground/nextjs-intl`](./playground/nextjs-intl#readme) and
[`playground/tanstack-start-paraglide`](./playground/tanstack-start-paraglide#readme)
carry the full numbers and the caveats.

## Thanks

The ideas here are inherited, not invented:

- [oxc-parser](https://oxc.rs/docs/guide/usage/parser) — the parser under
  every transform, fast enough to parse each file on every build.
- [GNU gettext](https://www.gnu.org/software/gettext/) — the PO workflow.
- [Lingui](https://lingui.dev/) — the macro shape and the `<0>...</0>` markup
  convention.
- [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJS) —
  proof that compile-time i18n with per-locale tree-shaking is viable.
- [next-intl](https://next-intl.dev/) — the reference for a complete Next.js
  integration.

Paraglide and next-intl also serve as the honest halves of the size comparison
above. The full list lives in
[`packages/best-i18n`](./packages/best-i18n#thanks).
