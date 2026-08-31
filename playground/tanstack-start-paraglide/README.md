# Paraglide playground

The same app as [`playground/tanstack-start`](../tanstack-start#readme) - same
two pages, same messages, same English/Chinese copy, same URL shape - built
with [Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)
instead.

Ported from
[TanStack's `i18n-paraglide` example](https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide),
which is a client-only Router app; this one is on Start with SSR, so the two
playgrounds are the same app and the numbers mean something.

```bash
pnpm --filter playground-tanstack-start-paraglide dev
```

## Size

Both apps, all client JS, gzipped:

| variant                            | client JS | raw      |
| ---------------------------------- | --------- | -------- |
| best-i18n                          | 99.0 kB   | 310.2 kB |
| best-i18n, `I18N_STATIC_LOCALE=zh` | 98.8 kB   | 309.7 kB |
| paraglide                          | 106.9 kB  | 334.9 kB |

About 8 kB gzip, and most of it is identifiable: the paraglide bundle carries a
`URLPattern`-based matcher, the cookie strategy and `preferredLanguage`
detection. That is a runtime, but it is a runtime for _routing_, not for
looking up messages - on the message side both libraries inline and tree-shake,
which is why the gap is a fixed 8 kB rather than something that grows with the
catalog.

## Where they actually differ

**The router integration is identical.** Both hand TanStack Router the same
pair:

```ts
createRouter({
  routeTree,
  rewrite: {
    input: ({ url }) => deLocalizeUrl(url),
    output: ({ url }) => localizeUrl(url),
  },
})
```

Same two function names, arrived at independently. Nothing to choose here.

**Paraglide wants a URL pattern per route.** A single catch-all is not enough -
`/zh/about` 404s until `/about` gets its own entry, which is why the TanStack
example lists every route too. What that buys is real: paraglide can translate
the path itself, `/about` becoming `/de/ueber`. best-i18n only ever prefixes,
and cannot do that at all.

**Keys versus source text.** `m.starter()` against `` t`A small starter...` ``.
Paraglide gets autocomplete and named, typed parameters; best-i18n gets one
catalog entry for a message no matter how many places use it - "About" is used
twice in both apps and is one entry here, two keys there - and no naming to
argue about.

**Per-message functions instead of an inlined ternary.** Paraglide compiles a
message to one function per locale plus a dispatcher, and calls it; best-i18n
inlines the locale ternary at each call site. So a message used many times in
one module is emitted many times here and once there - one message used 100
times costs +17.6 kB raw against +3.7 kB, and **+0.5 kB gzip either way**. The
dispatcher also reads `options.locale`, so paraglide can render one message in
an explicit language at the call site; best-i18n has no way to say that. And
`experimentalStaticLocale` is paraglide's `staticLocale`, so that one is a
draw, not an advantage.

**Markup inside a message is the sharp one.** Paraglide messages are plain
strings, so a sentence with a link in it has to be split by hand:

```tsx
<p>
  {m.read_the()}
  <a href={url}>{m.readme()}</a>
  {m.to_learn_more()}
</p>
```

That is three messages, and the split freezes the word order: a language that
wants the link at the end of the sentence cannot have it. `<Trans>` stores the
same sentence as one message, `Read the <0>README</0> to learn more.`, and lets
the translation put the link wherever it belongs.
