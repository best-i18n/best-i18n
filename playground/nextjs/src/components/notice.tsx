'use client'

import { Trans } from 'best-i18n/react/macro'

/**
 * A Client Component with no `useI18n()` anywhere in it, and no locale read at
 * module scope either.
 *
 * The `<Trans>` still gets its locale through React: the compiler gives the
 * message a component of its own, which is a legal place to call the hook
 * from. That is what makes the two halves of this module agree - the server
 * render has no ambient locale, only the one the provider passes down.
 *
 * The link stays here at the call site, passed in as a render prop, because
 * `href` is a prop of this component and cannot leave its scope.
 */
export function Notice({ href }: { href: string }) {
  return (
    <p>
      <Trans>
        A Client Component needs no hook for <a href={href}>this sentence</a>.
      </Trans>
    </p>
  )
}
