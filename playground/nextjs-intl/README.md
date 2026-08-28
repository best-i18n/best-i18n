# next-intl playground

The same app as [`playground/nextjs`](../nextjs#readme) - same two pages, same
eight messages, same English/Chinese copy, same `[locale]` routing with the
base locale unprefixed - built with [next-intl](https://next-intl.dev) instead.
It exists so the size comparison is between two libraries and not between two
different apps.

```bash
pnpm --filter playground-nextjs-intl dev
```

## Size

From the repo root:

```bash
pnpm build     # the best-i18n playground consumes the built package
pnpm bench
```

`scripts/bench-size.mjs` builds each variant, serves it, and adds up every
`/_next/static/*.js` the HTML of `/zh` and `/zh/about` references, resolved
back to files on disk. Gzip is what travels, so that is the column to read.

| variant                                      | client JS (gzip) | vs. no i18n |
| -------------------------------------------- | ---------------- | ----------- |
| no i18n at all (same app, strings hardcoded) | 173.4 kB         | -           |
| best-i18n                                    | 174.1 kB         | +0.7 kB     |
| best-i18n, `I18N_STATIC_LOCALE=zh`           | 174.0 kB         | +0.6 kB     |
| next-intl                                    | 187.4 kB         | +14.0 kB    |

The baseline row is not in `pnpm bench`: it is the same app with every message
replaced by a literal, measured once by hand.

## Scaling: what happens with a lot of text

Eight messages says almost nothing, so the same app was measured again with
**300 extra messages** added on top, rendered two ways: once from a Server
Component, once from a Client Component. All figures gzipped.

| page                                  | best-i18n | best-i18n `staticLocale` | next-intl |
| ------------------------------------- | --------- | ------------------------ | --------- |
| `/zh` - JS                            | 174.1 kB  | 174.0 kB                 | 187.4 kB  |
| `/zh` - HTML                          | 2.1 kB    | 2.1 kB                   | 4.4 kB    |
| 300 msgs in a Server Component - JS   | 173.7 kB  | 173.7 kB                 | 187.0 kB  |
| 300 msgs in a Server Component - HTML | 5.7 kB    | 5.7 kB                   | 8.1 kB    |
| 300 msgs in a Client Component - JS   | 175.9 kB  | 174.9 kB                 | 188.1 kB  |
| 300 msgs in a Client Component - HTML | 3.1 kB    | 3.1 kB                   | 5.5 kB    |

Three things fall out of it.

**Server-rendered messages cost best-i18n no client JS at all.** 173.7 kB with
300 of them, against 174.1 kB with none: the strings are inlined into the
server bundle and arrive as the HTML the page was going to send anyway. In an
App Router app that is most of the text.

**Client-rendered messages cost about 6 bytes each, gzipped, for both
languages.** +1.8 kB for 300, or +0.9 kB under `staticLocale`, which ships one
language instead of two. Raw it is +54.7 kB and +29.9 kB - the text really is
in there twice, gzip just compresses near-identical strings well.

**next-intl's catalog rides in every page's HTML, used or not.** `/zh` renders
none of the 300 new messages, and its HTML still went from 2.4 kB to 4.4 kB
gzip when they were added to the catalog. That is the default
`NextIntlClientProvider` behaviour; their docs show how to pass a subset
instead, at the cost of maintaining the list.

So the gap widens rather than closes: 13.6 kB at eight messages, 15.6 kB once
the catalog holds 308. Both libraries scale at a similar rate per message, but
best-i18n pays only for messages a client component actually renders, once, in
the chunk that renders them - and next-intl pays for the whole catalog on every
page.

## What the fixed 13 kB buys

next-intl's baseline cost is a runtime: an ICU message formatter, the catalog,
and the lookup. It buys plurals, select, dates, numbers and rich text, none of
which best-i18n does yet - see the Limitations section of the
[package README](../../packages/best-i18n#readme). That is the trade, and it is
a real one; the byte counts above are only one side of it.
