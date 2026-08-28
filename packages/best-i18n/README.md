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

| Framework                                                                 | Integration      |
| ------------------------------------------------------------------------- | ---------------- |
| Vite, and anything on it (TanStack Start, React Router, SvelteKit, Astro) | `best-i18n/vite` |
| Next.js (App Router, Turbopack or webpack)                                | `best-i18n/next` |

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

### Next.js

Next.js does not run on Vite, so it gets its own loader and its own way of
carrying the locale through a render.

```ts
// next.config.ts
import process from 'node:process'
import { createI18nPlugin } from 'best-i18n/next'

const withI18n = createI18nPlugin({
  messagesDir: fileURLToPath(new URL('./messages', import.meta.url)),
  locales: ['en', 'zh'],
  baseLocale: 'en',
  staticLocale: process.env.I18N_STATIC_LOCALE,
})

export default withI18n({})
```

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
stripped and applied respectively.

Why the pieces are what they are:

- **`getLocale()` in the root layout, once.** It is what pulls in the module
  that teaches the runtime where Next keeps the locale. Skip it and every
  message quietly renders in the base locale.
- **`LocaleProvider` even though the server already knows the locale.** Client
  components render in a second module graph that cannot see the server's
  render state; passing the locale through React is what keeps the server's
  HTML and the first client render identical.
- **Server Components need no per-file setup.** A layout and the page beneath
  it are separate renders in the App Router, so a locale stashed in one is not
  visible in the other. The locale is read from the route param instead, which
  is also why static rendering still works.

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

The catalog stores the markup as numbered placeholders, the way Lingui does and
for the same reason - a translator moves the pieces, and never sees a JSX
attribute:

```po
msgid "Read the <0>documentation</0> to learn more."
msgstr "请阅读<0>文档</0>了解更多。"
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
  request's locale - so they quietly fall back to the base one. Server
  Components are the other way round: they cannot call a hook, and do not need
  to.
- ICU plural/select is not built in yet; write complex messages as separate
  entries or handle counts in code.
- `from`/`hookFrom` match import specifiers as written in the source, so if
  you re-export the macros, list your module path in the plugin options.
- On Next.js, `best-i18n/next/server` reads the locale out of Next's internal
  render storage, because `t` has to resolve synchronously while `params` and
  `headers()` are async. That is a private API, so a Next.js major version can
  break it.
- In a Client Component use `useI18n`. Plain `t` there reads the ambient client
  locale, which `LocaleProvider` does not set.

## License

MIT
