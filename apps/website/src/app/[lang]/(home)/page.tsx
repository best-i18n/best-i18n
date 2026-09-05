'use client'
import { Link } from 'best-i18n/next/navigation'
import { useI18n } from 'best-i18n/react/macro'
import {
  ScrollArea,
  ScrollBar,
  ScrollViewport,
} from 'fumadocs-ui/components/ui/scroll-area'
import { highlightAll } from 'microlighter'
import { useEffect, useRef } from 'react'
import { gitConfig } from '~/lib/shared'
import 'microlighter/themes/github.css'

const source = `import { useI18n } from 'best-i18n/react/macro'

function About() {
  const t = useI18n()
  return <h1>{t\`A small starter with room to grow.\`}</h1>
}`

const compiled = `// compiled — a ternary, no runtime

function About() {
  const t = useLocale()
  return <h1>{t === 'zh'
    ? \`一个小而可长的起始模板。\`
    : \`A small starter with room to grow.\`}</h1>
}`

export default function HomePage() {
  const t = useI18n()
  const codeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // CSS Custom Highlight API: colors the text ranges without span soup, so
    // the static markup below stays exactly what the build emitted.
    if (codeRef.current) void highlightAll({ root: codeRef.current })
  }, [])

  const features = [
    {
      title: t`No keys`,
      body: t`The source text is the message; ids are content hashes managed for you in PO files.`,
    },
    {
      title: t`No runtime`,
      body: t`Messages compile to ternaries or plain literals. Unused messages tree-shake with the code that used them.`,
    },
    {
      title: t`PO workflow`,
      body: t`messages.pot + <locale>.po — the format translators, TMSes and LLMs already understand.`,
    },
    {
      title: t`SSR-safe`,
      body: t`The server locale lives in AsyncLocalStorage per request; no isolation means an error, never shared state.`,
    },
  ]

  return (
    <main className='flex flex-col items-center flex-1 px-4 py-16 text-center'>
      <h1 className='text-4xl font-bold mb-4'>best-i18n</h1>
      <p className='text-fd-muted-foreground max-w-xl mb-8 text-balance'>
        {t`Compile-time i18n. Write the source text inline; the compiler inlines every translation at the call site — no runtime catalog, no lookup, nothing to load.`}
      </p>
      <div className='flex gap-3 mb-12'>
        <Link
          href='/docs'
          className='rounded-full bg-fd-primary px-5 py-2 text-sm font-medium text-fd-primary-foreground'
        >
          {t`Get started`}
        </Link>
        <a
          href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`}
          rel='noreferrer noopener'
          className='rounded-full border px-5 py-2 text-sm font-medium'
        >
          GitHub
        </a>
      </div>
      <div
        ref={codeRef}
        data-syntax-theme='github'
        className='grid w-full max-w-3xl gap-4 text-left md:grid-cols-2 mb-12'
      >
        <ScrollArea className='overflow-hidden rounded-lg border bg-(--syntax-background)'>
          <ScrollViewport>
            <pre className='w-max min-w-full p-4 text-xs leading-relaxed'>
              <code className='language-tsx'>{source}</code>
            </pre>
          </ScrollViewport>
          <ScrollBar orientation='horizontal' />
        </ScrollArea>
        <ScrollArea className='overflow-hidden rounded-lg border bg-(--syntax-background)'>
          <ScrollViewport>
            <pre className='w-max min-w-full p-4 text-xs leading-relaxed'>
              <code className='language-tsx'>{compiled}</code>
            </pre>
          </ScrollViewport>
          <ScrollBar orientation='horizontal' />
        </ScrollArea>
      </div>
      <div className='grid w-full max-w-3xl gap-4 text-left sm:grid-cols-2'>
        {features.map((f) => (
          <div key={f.title} className='rounded-lg border bg-fd-card p-4'>
            <h2 className='mb-1 font-medium'>{f.title}</h2>
            <p className='text-sm text-fd-muted-foreground'>{f.body}</p>
          </div>
        ))}
      </div>
    </main>
  )
}
