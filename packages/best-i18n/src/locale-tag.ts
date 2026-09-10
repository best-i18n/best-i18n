/**
 * Matching a browser's language tags against the configured locales.
 *
 * Shared by `resolveLocale` on the server and `resolveClientLocale` in the
 * browser: `Accept-Language` and `navigator.languages` carry the same tags,
 * and the two sides must reach the same locale or an unprefixed path
 * hydrates in the wrong language.
 */

/**
 * Drops the last subtag, the way RFC 4647 lookup does - and with it a
 * trailing singleton, since the `x` of `en-x-p1` is not a tag on its own.
 */
function truncate(tag: string): string {
  const cut = tag.lastIndexOf('-')
  if (cut === -1) return ''

  const shorter = tag.slice(0, cut)
  const previous = shorter.lastIndexOf('-')

  return shorter.length - previous === 2 ? shorter.slice(0, previous) : shorter
}

/**
 * The configured locale a list of language tags asks for, in the spelling the
 * config uses, or `undefined` when none of them is on offer.
 *
 * `tags` comes in preference order. Each one is tried from most to least
 * specific - `zh-Hant-TW`, `zh-Hant`, `zh` - and then widened the other way:
 * a request for `en-GB` reaches a locale configured as `en-US` before English
 * is given up on entirely. Without that second step a config spelled with
 * regions, which is a perfectly ordinary way to spell one, matches almost
 * nothing a real browser sends.
 *
 * A tag is answered as far as it can be before the next one is considered, so
 * `en-GB, de` against `['de', 'en-US']` is English rather than German.
 */
export function matchLocale(
  tags: readonly string[],
  locales: readonly string[],
): string | undefined {
  const lowered = locales.map((locale) => locale.toLowerCase())

  const configured = (needle: string): string | undefined => {
    const index = lowered.indexOf(needle)
    return index === -1 ? undefined : locales[index]
  }

  for (const raw of tags) {
    const tag = raw.trim().toLowerCase()
    if (tag === '') continue

    for (
      let candidate = tag;
      candidate !== '';
      candidate = truncate(candidate)
    ) {
      const exact = configured(candidate)
      if (exact !== undefined) return exact
    }

    const language = tag.split('-')[0]
    const relative = locales.find(
      (locale) => locale.toLowerCase().split('-')[0] === language,
    )
    if (relative !== undefined) return relative
  }

  return undefined
}

/**
 * The tags of an `Accept-Language` header, best first.
 *
 * `q=0` means "not acceptable", so such a tag must not win by merely being
 * present, and a header is attacker-supplied: anything unparseable drops out
 * rather than throwing.
 */
export function rankAcceptLanguage(header: string): string[] {
  return (
    header
      .split(',')
      .map((entry) => {
        const [tag, ...params] = entry.trim().split(';')
        const q = params
          .map((param) => param.trim())
          .find((param) => param.startsWith('q='))
        return { tag: (tag ?? '').trim(), q: q ? Number(q.slice(2)) : 1 }
      })
      .filter(
        (entry) => entry.tag !== '' && !Number.isNaN(entry.q) && entry.q > 0,
      )
      // Sort is stable, so tags of equal quality keep the order they were sent.
      .sort((a, b) => b.q - a.q)
      .map((entry) => entry.tag)
  )
}
