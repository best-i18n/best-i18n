import { createFileRoute } from '@tanstack/react-router'

import { m } from '@/paraglide/messages'

export const Route = createFileRoute('/about')({
  component: AboutPage,
})

function AboutPage() {
  return (
    <>
      <h1>{m.about()}</h1>
      <p>{m.inlines({ name: 'paraglide' })}</p>
      <p>{m.no_runtime()}</p>
      {/*
        Paraglide messages are plain strings, so a sentence with a link in it
        has to be split into three of them by hand - and the split fixes the
        word order for every language.
      */}
      <p>
        {m.read_the()}
        <a href='https://github.com/Debbl/best-i18n'>{m.readme()}</a>
        {m.to_learn_more()}
      </p>
    </>
  )
}
