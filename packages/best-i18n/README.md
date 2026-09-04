# best-i18n

Compile-time i18n. Write the source text inline; the compiler inlines every
translation at the call site, so there is no runtime catalog, no lookup, and
nothing to load. A per-locale build collapses to plain string literals.

```tsx
import { useI18n } from 'best-i18n/react/macro'

function About() {
  const t = useI18n()
  return <h1>{t`A small starter with room to grow.`}</h1>
}
```

compiles (default build) to

```js
const t = useLocale() // re-renders on locale change
return (
  <h1>
    {t === 'zh'
      ? `一个小而可长的起始模板。`
      : `A small starter with room to grow.`}
  </h1>
)
```

and with `staticLocale: 'zh'` (per-locale build) to

```js
return <h1>{`一个小而可长的起始模板。`}</h1>
```

## Why

- **No keys.** The source text is the message; ids are content hashes managed
  for you in PO files.
- **No runtime.** Messages compile to ternaries (single build) or literals
  (per-locale build). Unused messages tree-shake with the code that used them.
- **PO workflow.** `messages.pot` + `<locale>.po` — the format translators,
  TMSes and LLMs already understand. Rewording a message carries its
  translation over as `fuzzy` instead of losing it; removed messages become
  `#~` obsolete entries, never deleted.
- **SSR-safe.** The server locale lives in AsyncLocalStorage per request; if
  the runtime cannot provide isolation it throws instead of silently sharing
  state between requests.

## Setup

```bash
pnpm add best-i18n
```

Pick the integration for your framework. Everything below it - the macros, the
PO workflow, the URL helpers - is the same either way.

| Framework                                                                 | Integration          |
| ------------------------------------------------------------------------- | -------------------- |
| Vite, and anything on it (TanStack Start, React Router, SvelteKit, Astro) | `best-i18n/vite`     |
| Next.js (App Router, Turbopack or webpack)                                | `best-i18n/next`     |
| Rolldown used directly, and tools built on it (tsdown, ...)               | `best-i18n/rolldown` |

rolldown-vite keeps the Vite plugin API, so it takes `best-i18n/vite`
unchanged; `best-i18n/rolldown` is for Rolldown without Vite around it.

### Vite

```ts
// vite.config.ts
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { i18n } from 'best-i18n/vite'

export default defineConfig({
  plugins: [
    i18n({
      messagesDir: fileURLToPath(new URL('./messages', import.meta.url)),
      locales: ['en', 'zh'],
      baseLocale: 'en',
      // set (e.g. from an env var) to build a single locale as pure literals
      staticLocale: process.env.I18N_STATIC_LOCALE,
    }),
    // ...other plugins
  ],
})
```

### Rolldown

The same options as the Vite plugin. The plugin declares Rolldown hook
filters, so files that never name a macro module are skipped in Rust and the
JavaScript plugin is not even called for them.

```ts
// rolldown.config.ts
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { i18n } from 'best-i18n/rolldown'

export default {
  input: 'src/main.ts',
  plugins: [
    i18n({
      messagesDir: fileURLToPath(new URL('./messages', import.meta.url)),
      locales: ['en', 'zh'],
      baseLocale: 'en',
      staticLocale: process.env.I18N_STATIC_LOCALE,
    }),
  ],
}
```

### Next.js

Next.js does not run on Vite, so it gets its own loader and its own way of
carrying the locale through a render.

```ts
// src/i18n.ts - one description of the languages and the URL shape
import { defineI18nConfig } from 'best-i18n/next/config'

export const i18n = defineI18nConfig({
  locales: ['en', 'zh'],
  baseLocale: 'en',
  exclude: '^/(api|_next)/',
})
```

```ts
// next.config.ts - the same description, imported rather than repeated
import process from 'node:process'
import { createI18nPlugin } from 'best-i18n/next'
import { i18n } from './src/i18n'

const withI18n = createI18nPlugin({
  ...i18n,
  messagesDir: fileURLToPath(new URL('./messages', import.meta.url)),
  staticLocale: process.env.I18N_STATIC_LOCALE,
})

export default withI18n({})
```

The locales are spread in rather than repeated: the compiler needs them at
build time, and `src/i18n.ts` is where they are described once.

```ts
// src/proxy.ts - points a public URL at the [locale] segment
import { createProxy } from 'best-i18n/next/proxy'
import { i18n } from '@/i18n'

export const proxy = createProxy(i18n)
export const config = { matcher: ['/((?!_next|.*\\..*).*)'] }
```

```tsx
// src/app/[locale]/layout.tsx
import { getLocale } from 'best-i18n/next/server'
import { LocaleProvider } from 'best-i18n/react'
import { i18n } from '@/i18n'

export function generateStaticParams() {
  return i18n.locales.map((locale) => ({ locale }))
}

export const dynamicParams = false

export default function LocaleLayout({ children }) {
  const locale = getLocale()

  return (
    <html lang={locale}>
      <body>
        <LocaleProvider locale={locale} config={i18n}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  )
}
```

That is the whole setup. `t` then works in any Server Component - no per-file
call, no `await`, static rendering intact - and `useI18n` in any Client Component.

Routes live under `[locale]`, but the base locale's URLs stay unprefixed:
`/about` is English, `/zh/about` is Chinese, and `/en/about` redirects to the
canonical `/about`. Links are written unprefixed and localized as they render:

```tsx
import { Link } from 'best-i18n/next/navigation'

// Renders href="/zh/about" while Chinese is active.
function Nav() {
  return <Link href='/about'>{t`About`}</Link>
}
```

`usePathname` and `useRouter` come from the same module, with the prefix
stripped and applied respectively. All three read the URL layout from
`LocaleProvider`, so the config is described once and travels once - and they
are exported one by one, so an app that only links does not carry the other
two.

The unprefixed base locale assumes a proxy is there to rewrite `/about` onto
the `[locale]` segment. A deployment without one - a static export serves only
the files that exist - sets `prefixBase: true` in the config instead:
`/en/about` becomes the canonical form, `Link` prefixes the base locale like
any other, and a proxy (if one runs anyway) redirects unprefixed URLs out
rather than stripping `/en`.

Why the pieces are what they are:

- **`getLocale()` in the root layout, once.** It is what pulls in the module
  that teaches the runtime where Next keeps the locale. Skip it and every
  message quietly renders in the base locale.
- **`LocaleProvider` even though the server already knows the locale.** Client
  components render in a second module graph that cannot see the server's
  render state; passing the locale through React is what keeps the server's
  HTML and the first client render identical. Its `config` is required for the
  same reason: it is the channel `Link` and `usePathname` read the URL layout
  from, so keep it serializable (`exclude` as a string).
- **Server Components need no per-file setup.** A layout and the page beneath
  it are separate renders in the App Router, so a locale stashed in one is not
  visible in the other. The locale is read from the route param instead, which
  is also why static rendering still works.

### Plain JavaScript

No framework required: the Vite or Rolldown plugin plus the `t` macro is the
whole system. `best-i18n/runtime` is the locale state the compiled messages
read - it plays the role `@lingui/core` plays for Lingui, minus the catalog,
because there is nothing to load. It is also, in its entirety, the runtime the
"no runtime" pitch leaves standing.

```ts
import { t } from 'best-i18n/macro'
import { getLocale, setLocale, subscribeLocale } from 'best-i18n/runtime'

function render() {
  document.querySelector('h1')!.textContent =
    t`A small starter with room to grow.`
}

// A message is evaluated where it is called, so a locale change means
// re-running the code that renders - same as Lingui's activate-then-rerender.
subscribeLocale(render)
document.querySelector('select')!.onchange = (e) => {
  setLocale((e.target as HTMLSelectElement).value)
}
render()
```

`setLocale` is client-only, deliberately: on a server one shared locale would
leak between concurrent requests. There the locale is bound per request or per
scope instead - `withRequestLocale(request, config, fn)` in a fetch handler,
`withLocale(locale, fn)` in a script - both from `best-i18n/server`, both
feeding the same `getLocale()` the messages compile to.

```ts
import { t } from 'best-i18n/macro'
import { withLocale } from 'best-i18n/server'

for (const locale of ['en', 'zh']) {
  withLocale(locale, () => console.log(t`A small starter with room to grow.`))
}
```

## Writing messages

Anywhere — loaders, server functions, plain modules:

```tsx
import { t } from 'best-i18n/macro'

const title = t`A small starter with room to grow.`
const greeting = t`Hi ${name}, you have ${count} items`
```

Inside React components, reactive to locale changes:

```tsx
import { useI18n } from 'best-i18n/react/macro'

function About() {
  const t = useI18n()
  return <p>{t`About`}</p>
}
```

Both are compile-time macros: the binding can only be used as a tagged
template. Storing it, passing it around, destructuring `useI18n()` or shadowing
the name is a build error with a file and offset, not a runtime surprise.

A line break inside a template is code formatting, not content: it collapses
to a single space - the same rule JSX applies to `<Trans>` - so re-indenting a
component never changes a message or orphans its translations. Write `\n` for
a literal newline.

An interpolated identifier names its own placeholder, so the translator sees
`Hi {name}, you have {count} items` rather than `Hi {0}, you have {1}`.
Anything more complex than an identifier falls back to a number. A dropped or
invented placeholder in a translation is a build error naming the file, the
locale and the message.

### Plurals

```tsx
import { plural } from 'best-i18n/macro'

const label = plural(count, `One item`, `${count} items`)
```

The two forms are one gettext entry - `msgid` and `msgid_plural` - and each
locale's `.po` supplies as many `msgstr[n]` forms as its `Plural-Forms` header
declares (Russian three, Chinese one; there is a built-in table for catalogs
that don't set the header). The compiler inlines that locale's selection
formula at the call site, so what ships is a small arrow function per plural
message - no ICU runtime, no `Intl.PluralRules`, and a one-form locale gets
the bare string with no dispatch at all. The count is always available to a
translation as a placeholder, interpolated or not.

### Context

Two identical texts that must translate differently are different messages.
`ctx` is gettext's `msgctxt`:

```tsx
const verb = t.ctx('verb')`Open` // 打开
const sign = t.ctx('adjective')`Open` // 营业中
const markup = <Trans ctx='verb'>Open</Trans>
```

### Comments for the translator

A `// i18n:` comment directly above (or on the line of) a message becomes a
`#.` extracted comment in the catalogs:

```tsx
// i18n: Button label on the home page, keep it short
const label = t`Save`
```

### Messages with markup

A tagged template cannot hold JSX, so a sentence with a link or a bold run in
it has nowhere to go. `<Trans>` is that place:

```tsx
import { Trans } from 'best-i18n/react/macro'

function About() {
  return (
    <p>
      <Trans>
        Read the <a href={docsUrl}>documentation</a> to learn more.
      </Trans>
    </p>
  )
}
```

The catalog stores the markup as named placeholders - the tag's own name
where it has one, a number where it does not - for the reason Lingui
established: a translator moves the pieces, and never sees a JSX attribute:

```po
msgid "Read the <a>documentation</a> to learn more."
msgstr "请阅读<a>文档</a>了解更多。"
```

Where this parts ways with Lingui is what runs. There is no component walking a
message tree per render: each locale's version is reassembled into ordinary JSX
at build time, so the above compiles to

```jsx
getLocale() === 'zh' ? (
  <>
    请阅读<a href={docsUrl}>文档</a>了解更多。
  </>
) : (
  <>
    Read the <a href={docsUrl}>documentation</a> to learn more.
  </>
)
```

and, under `staticLocale`, to the one branch on its own.

Whitespace follows JSX's own rules, so the stored message matches what renders

- including the space a line break swallows, which is why `{' '}` exists.
  `<Trans>` takes no props, `key` included: wrap it in the element that needs one.

## Extract and translate

```bash
i18n-extract --locales en,zh          # writes messages/messages.pot + zh.po
i18n-extract --locales en,zh --check  # CI: exit 1 when stale or untranslated
i18n-compile --locales en,zh --outdir out --format json   # optional JSON/JS export
```

The `.po` files are the source of truth — the vite plugin reads them directly,
no compile step in between. Editing a message file in dev triggers a full
reload. An extract run never reduces the number of translations; if it would,
it refuses and asks for `--force`.

Fuzzy translations do not build — standard gettext behaviour. A carried-over
translation stays in the catalog marked `fuzzy`, the message falls back to the
base locale, and the build reports it as missing until someone reviews it. A
translation whose `{0}`/`<0>` placeholders do not match the source is a build
error naming the file, locale and message; `i18n-extract` reports the same
mismatch when it merges, so a bad TMS import is visible before anyone builds.
Comments, flags, plural entries and headers written by translators or a TMS
survive a rewrite untouched.

## Locale resolution and URLs

On any server that owns its own request handler - a Vite-based framework, a
Worker, a plain fetch handler - bind the locale per request. Next.js does this
for you, through the proxy.

```ts
import { withRequestLocale } from 'best-i18n/server'

export default {
  async fetch(request: Request) {
    return withRequestLocale(request, I18N, () => handler.fetch(request))
  },
}
```

Resolution order: URL prefix → cookie → `Accept-Language` → base locale. The
client mirrors the same order (`resolveClientLocale`) so hydration matches SSR.
`localizeUrl`/`deLocalizeUrl` plug into router URL rewriting, with an `exclude`
pattern for paths that must never be localized (`/api/...`).

## Limitations

- Messages must be statically visible — no dynamic message construction.
- On Next.js, a Client Component has to take its locale from `useI18n()`.
  Plain `t` and a `<Trans>` with no `useI18n()` above it read `getLocale()`,
  and client components render in a module graph where nothing has bound the
  request's locale - so they would fall back to the base one, on the server
  only, and React patches the difference at hydration without a word. The
  loader refuses to compile that, naming the file, the line and the message.
  Server Components are the other way round: they cannot call a hook, and do
  not need to.
- Plurals are gettext plurals (`plural(count, one, other)`), not ICU: there
  is no `select`/gender construct yet, and no number/date formatting - reach
  for `Intl` with `getLocale()` for those.
- `from`/`hookFrom` match import specifiers as written in the source, so if
  you re-export the macros, list your module path in the plugin options.
- On Next.js, `best-i18n/next/server` reads the locale out of Next's internal
  render storage, because `t` has to resolve synchronously while `params` and
  `headers()` are async. That is a private API, so a Next.js major version can
  break it. The field it reads, `rootParams`, arrived in 15.2, which is the
  peer floor.
- In a Client Component prefer `useI18n`. Plain `t` there reads the ambient
  client locale, which `LocaleProvider` mirrors on the client - but only from
  the nearest provider, and without re-rendering on a locale change the way
  `useI18n` does.
- `best-i18n/server` needs `AsyncLocalStorage`. Node and Bun ship it; on
  Cloudflare Workers it exists only behind the `nodejs_compat` (or
  `nodejs_als`) compatibility flag, and without the flag the import throws
  with an error saying exactly that, instead of silently sharing one locale
  between requests.
- workerd does not implement `AsyncLocalStorage.enterWith()`. best-i18n only
  calls it in `best-i18n/next/server` - a route handler prerendered outside a
  React render - which by definition runs on Node, where it is fully
  supported (Bun too). On Workers the locale is bound with
  `withRequestLocale` from `best-i18n/server`, which uses `.run()` and is
  unaffected. (`enterWith` binds the remainder of the current synchronous
  frame, which is why Node's docs prefer `run` - here that frame is exactly
  the handler invocation, which is the intent.)

## Thanks

best-i18n did not invent its best ideas, it inherited them:

- [GNU gettext](https://www.gnu.org/software/gettext/) — the PO workflow this
  package speaks: source text as the message, `fuzzy` instead of data loss,
  `#~` instead of deletion. Decades of translator tooling work because these
  conventions are respected.
- [Lingui](https://lingui.dev/) — the macro shape and the `<0>...</0>`
  placeholder convention for markup in messages, adopted here for the same
  reason it exists there: a translator should never see a JSX attribute.
- [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJS) —
  the proof that compile-time i18n with per-locale tree-shaking is viable, and
  the bar for what a locale-strategy API can look like.
- [next-intl](https://next-intl.dev/) — the reference for what a complete
  Next.js App Router integration covers; its playground twin in this repo is
  what keeps the size claims honest.
- [gettext-parser](https://github.com/smhg/gettext-parser) — the PO codec
  underneath `i18n-extract`.

## License

MIT
