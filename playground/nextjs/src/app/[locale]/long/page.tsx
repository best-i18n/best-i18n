import { plural, t } from 'best-i18n/macro'
import { Trans } from 'best-i18n/react/macro'

import { localeAlternates } from '@/seo'

import type { Metadata } from 'next'

export function generateMetadata(): Metadata {
  return {
    title: t`Field notes on shipping translations`,
    description: t`A deliberately long page: many messages, long paragraphs, plurals, context and markup, all compiled away.`,
    alternates: localeAlternates('/long'),
  }
}

/**
 * A stress page: one Server Component carrying ~50 messages, several of them
 * long multi-line templates. It exists to exercise the pipeline at volume -
 * extraction, PO merging, compilation - and to demonstrate that server-rendered
 * text costs no client JavaScript no matter how much of it there is.
 *
 * It is deliberately not part of the bench pages (`/zh`, `/zh/about`), so the
 * twin-playground size comparison stays untouched.
 */
export default function LongPage() {
  const library = 'best-i18n'
  const format = 'PO'
  const counts = [0, 1, 2, 5]

  return (
    <article>
      <h1>{t`Field notes on shipping translations`}</h1>
      <p>
        {t`Everything on this page is a compiled message. There is no catalog
           behind it, no lookup at request time, and no formatter parsing
           anything in the browser. If you are reading this in Chinese, the
           Chinese text below was chosen by a ternary that the compiler wrote,
           and in a static-locale build even the ternary is gone.`}
      </p>

      <h2>{t`Why the source text is the message`}</h2>
      <p>
        {t`A key like home.hero.subtitle is a pointer into a file somewhere
           else, and every pointer can dangle. When the text itself is the
           identifier there is nothing to keep in sync: renaming a variable
           does not orphan a translation, and a reviewer reading the diff sees
           the words that will actually render.`}
      </p>
      <p>
        {t`The cost of that choice is honesty about what a change means. Fixing
           a typo in the source text is a new message, because the old string
           was the id. The catalog carries the old translation over marked
           fuzzy, a translator confirms it, and the history stays visible
           instead of being silently rewritten.`}
      </p>
      <p>
        {t`${library} stores those messages in ${format} files, because the
           tooling translators already use has spoken that format for thirty
           years. Nothing about the pipeline is proprietary: msgid in, msgstr
           out, and every intermediate state survives a round trip through a
           TMS.`}
      </p>

      <h2>{t`What a long paragraph compiles to`}</h2>
      <p>
        {t`This paragraph is intentionally much longer than anything a landing
           page would carry, because the point of this page is volume. It keeps
           going for several sentences, the way documentation prose actually
           does, so that the extracted catalog contains realistic entries
           rather than toy strings. Line breaks in the source template collapse
           to single spaces at compile time, which means re-indenting this file
           will never orphan the translation you are reading right now.`}
      </p>
      <p>
        {t`Rendered from a Server Component, all of this text reaches the
           browser as HTML and costs exactly zero bytes of client JavaScript.
           The measured number from the twin playgrounds: three hundred extra
           server-rendered messages added nothing to the client bundle at
           all.`}
      </p>

      <h2>{t`Plurals without a formatter`}</h2>
      <p>
        {t`Each locale's plural formula is inlined at the call site. English
           has two forms, Chinese has one, Russian would have three - and the
           compiled code for a one-form locale is just the bare string.`}
      </p>
      <ul>
        {counts.map((n) => (
          <li key={n}>
            {plural(n, `You have one message.`, `You have ${n} messages.`)}
          </li>
        ))}
      </ul>

      <h2>{t`Context when the same word must differ`}</h2>
      <p>
        {t`Two identical source texts that translate differently are two
           different messages, keyed by gettext's msgctxt:`}
      </p>
      <ul>
        <li>{t.ctx('verb')`Open`}</li>
        <li>{t.ctx('adjective')`Open`}</li>
      </ul>

      <h2>{t`Markup stays out of the translator's way`}</h2>
      <p>
        <Trans>
          A sentence can hold <strong>bold text</strong> and a{' '}
          <a href='https://github.com/Debbl/best-i18n'>link</a> at once, and the
          translator still only ever sees named placeholders - never a JSX
          attribute, never an import, never a prop.
        </Trans>
      </p>
      <p>
        <Trans>
          What ships is the markup itself, rebuilt per locale at build time -
          there is <em>no component</em> walking a message tree on every render.
        </Trans>
      </p>

      <h2>{t`The workflow at volume`}</h2>
      <p>
        {t`Extraction scans the source, writes the template, and merges each
           locale's catalog without ever reducing the number of translations -
           if a run would shrink a catalog, it refuses and asks for an explicit
           force flag. On a page like this one, that guard is the difference
           between a refactor and an accident.`}
      </p>
      <p>
        {t`Validation runs both at merge time and at build time. A translation
           that drops a placeholder, invents one, or supplies the wrong number
           of plural forms is an error naming the file, the locale and the
           message - before anything reaches a user.`}
      </p>
      <p>
        {t`Fuzzy entries do not build. They fall back to the base locale and
           are reported as missing, which sounds strict until the alternative
           is shipping a stale translation under a reworded source.`}
      </p>

      <h2>{t`What this page proves`}</h2>
      <p>
        {t`If every heading and paragraph above renders in your language, then
           roughly fifty messages - including this one - survived extraction,
           merging, translation and compilation in one pass. The client bundle
           for this route contains none of them.`}
      </p>
    </article>
  )
}
