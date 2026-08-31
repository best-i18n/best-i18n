/**
 * `<Trans>` is the half of the macro that a tagged template cannot reach: a
 * message whose shape includes markup, so a translator can move a link or a
 * bold run to wherever their language wants it.
 *
 * The message is stored with the markup replaced by placeholders - `Read the
 * <a>docs</a>` - the convention Lingui arrived at, for the same reason: a
 * translator should never have to see, or be able to break, a JSX attribute.
 * Only the ordering is theirs. Placeholders are *named* where the source
 * gives them a name - the element's tag, an interpolated identifier - and
 * fall back to numbers where it does not, so `Hi {name}` reads like the
 * sentence it is instead of `Hi {0}`.
 *
 * Where this parts ways with Lingui is what happens at build time. There is no
 * runtime component putting the pieces back together per render: the parts are
 * reassembled here, once, into ordinary JSX per locale, so what ships is the
 * markup itself.
 */

/** An element placeholder, kept as source so its attributes survive intact. */
export interface TransElement {
  /** The `<a>` in `<a>docs</a>` - the token a translation moves around. */
  token: string
  /** `<a href={url}>`, or the whole element when it is self-closing. */
  open: string
  /** `</a>`, empty for a self-closing element. */
  close: string
  selfClosing: boolean
}

export interface TransMessage {
  text: string
  expressions: string[]
  /** Token for each expression, in parallel: `name` for `${name}`, else `0`. */
  placeholders: string[]
  elements: TransElement[]
}

export type MessagePart =
  | { kind: 'text'; value: string }
  | { kind: 'expression'; token: string }
  | { kind: 'element'; token: string; children: MessagePart[] }

interface JsxNode {
  type?: string
  value?: string
  raw?: string
  start?: number
  end?: number
  expression?: JsxNode
  children?: JsxNode[]
  openingElement?: {
    start?: number
    end?: number
    selfClosing?: boolean
    name?: { type?: string; name?: string }
  }
  closingElement?: { start?: number; end?: number } | null
  openingFragment?: { start?: number; end?: number }
  closingFragment?: { start?: number; end?: number } | null
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/**
 * Registers an expression and returns its token.
 *
 * A plain identifier names its own placeholder - `${name}` becomes `{name}`,
 * which is what the translator should see. Anything else gets a number. The
 * same expression interpolated twice shares one token, so the message reads
 * `{count} of {count}` rather than `{0} of {1}`.
 */
export function tokenForExpression(
  source: string,
  expressions: string[],
  placeholders: string[],
): string {
  const existing = expressions.indexOf(source)
  if (existing !== -1) return placeholders[existing]!

  let token: string
  if (IDENTIFIER.test(source) && !placeholders.includes(source)) {
    token = source
  } else {
    let index = placeholders.length
    while (placeholders.includes(String(index))) index++
    token = String(index)
  }

  expressions.push(source)
  placeholders.push(token)
  return token
}

/** A token for an element: its tag name if usable and free, else a number. */
function tokenForElement(name: string | undefined, taken: string[]): string {
  if (name !== undefined && IDENTIFIER.test(name) && !taken.includes(name)) {
    return name
  }

  let index = taken.length
  while (taken.includes(String(index))) index++
  return String(index)
}

/**
 * JSX collapses whitespace before it ever reaches the DOM, so the message has
 * to be stored collapsed too - otherwise the text a translator sees would
 * differ from the text that renders, and re-indenting a component would orphan
 * every translation of it.
 *
 * This is the rule JSX itself uses: lines are trimmed at the edges, blank ones
 * disappear, and what is left joins with single spaces.
 */
export function cleanJsxText(text: string): string {
  const lines = text.split(/\r\n|\n|\r/)

  let lastContentLine = 0
  for (let index = 0; index < lines.length; index++) {
    if (/[^\t ]/.test(lines[index]!)) lastContentLine = index
  }

  let out = ''
  for (let index = 0; index < lines.length; index++) {
    let line = lines[index]!.replace(/\t/g, ' ')
    if (index !== 0) line = line.replace(/^ +/, '')
    if (index !== lines.length - 1) line = line.replace(/ +$/, '')
    if (line === '') continue
    out += index === lastContentLine ? line : `${line} `
  }

  return out
}

/**
 * The named entities JSX text is likely to carry. Not the full HTML list -
 * an unknown entity passes through untouched rather than failing - but the
 * ones that show up in real copy.
 */
const ENTITIES = new Map<string, string>([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
  ['copy', '©'],
  ['reg', '®'],
  ['trade', '™'],
  ['hellip', '…'],
  ['mdash', '—'],
  ['ndash', '–'],
  ['lsquo', '‘'],
  ['rsquo', '’'],
  ['ldquo', '“'],
  ['rdquo', '”'],
  ['laquo', '«'],
  ['raquo', '»'],
  ['times', '×'],
  ['middot', '·'],
  ['bull', '•'],
  ['deg', '°'],
  ['plusmn', '±'],
  ['sect', '§'],
  ['para', '¶'],
  ['euro', '€'],
  ['pound', '£'],
  ['yen', '¥'],
  ['cent', '¢'],
])

/**
 * Decodes HTML entities in JSX text, the way JSX itself renders them.
 *
 * The message ends up in a template literal, where `&amp;` means five
 * characters - so leaving entities encoded changes what pre-existing correct
 * JSX renders. The translator also deserves to see `Tom & Jerry`, not markup.
 */
export function decodeEntities(text: string): string {
  return text.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (whole, body: string) => {
      if (body.startsWith('#x') || body.startsWith('#X')) {
        const code = Number.parseInt(body.slice(2), 16)
        return Number.isNaN(code) ? whole : String.fromCodePoint(code)
      }
      if (body.startsWith('#')) {
        const code = Number.parseInt(body.slice(1), 10)
        return Number.isNaN(code) ? whole : String.fromCodePoint(code)
      }
      return ENTITIES.get(body) ?? whole
    },
  )
}

/** Turns the children of a `<Trans>` into a message plus its raw material. */
export function serializeTrans(
  children: readonly unknown[],
  code: string,
  filename: string,
): TransMessage {
  const expressions: string[] = []
  const placeholders: string[] = []
  const elements: TransElement[] = []

  const text = serializeChildren(
    children as JsxNode[],
    code,
    filename,
    expressions,
    placeholders,
    elements,
  )

  return { text, expressions, placeholders, elements }
}

function serializeChildren(
  children: JsxNode[],
  code: string,
  filename: string,
  expressions: string[],
  placeholders: string[],
  elements: TransElement[],
): string {
  let out = ''

  for (const child of children) {
    switch (child.type) {
      case 'JSXText': {
        out += decodeEntities(cleanJsxText(child.value ?? child.raw ?? ''))
        break
      }

      case 'JSXExpressionContainer': {
        const expression = child.expression
        // `{/* a comment */}` is not a value and has nothing to translate.
        if (expression === undefined) break
        if (expression.type === 'JSXEmptyExpression') break

        const source = code.slice(
          expression.start as number,
          expression.end as number,
        )
        out += `{${tokenForExpression(source, expressions, placeholders)}}`
        break
      }

      case 'JSXElement':
      case 'JSXFragment': {
        const isFragment = child.type === 'JSXFragment'
        const opening = isFragment
          ? child.openingFragment
          : child.openingElement
        const closing = isFragment
          ? child.closingFragment
          : child.closingElement
        const selfClosing = child.openingElement?.selfClosing === true

        // The tag name where there is one - `<a>` stays `<a>` for the
        // translator - and a number for fragments, member expressions and
        // repeats. Reserved before recursing, so nesting reads outside-in.
        const name =
          child.openingElement?.name?.type === 'JSXIdentifier'
            ? child.openingElement.name.name
            : undefined
        const token = tokenForElement(
          name,
          elements.map((element) => element.token),
        )
        const index = elements.length
        elements.push({ token, open: '', close: '', selfClosing: false })

        elements[index] = {
          token,
          open: code.slice(opening?.start as number, opening?.end as number),
          // Null, not undefined, for a self-closing element.
          close:
            closing == null
              ? ''
              : code.slice(closing.start as number, closing.end as number),
          selfClosing,
        }

        const inner = selfClosing
          ? ''
          : serializeChildren(
              child.children ?? [],
              code,
              filename,
              expressions,
              placeholders,
              elements,
            )

        out += inner === '' ? `<${token}/>` : `<${token}>${inner}</${token}>`
        break
      }

      default:
        throw new Error(
          `best-i18n: <Trans> in ${filename} contains a ${child.type} child, ` +
            'which has no place in a message. Move it outside the <Trans>.',
        )
    }
  }

  return out
}

const TOKEN = String.raw`([A-Za-z0-9_$]+)`

/**
 * Reads a stored message back into parts.
 *
 * Translations are edited by hand, so a broken one is a question of when rather
 * than whether. Every failure here names the message, and happens at build time
 * rather than in front of a user.
 */
export function parseMessage(text: string, describe: string): MessagePart[] {
  const root: MessagePart[] = []
  const stack: MessagePart[][] = [root]
  const open: string[] = []
  let cursor = 0
  let literal = ''

  const selfClosingRe = new RegExp(String.raw`^<${TOKEN}\s*/>`)
  const openingRe = new RegExp(`^<${TOKEN}>`)
  const closingRe = new RegExp(String.raw`^</${TOKEN}>`)
  const valueRe = new RegExp(String.raw`^\{${TOKEN}\}`)

  const flush = () => {
    if (literal === '') return
    stack[stack.length - 1]!.push({ kind: 'text', value: literal })
    literal = ''
  }

  const fail = (reason: string): never => {
    throw new Error(`best-i18n: ${describe}: ${reason} in "${text}"`)
  }

  while (cursor < text.length) {
    const rest = text.slice(cursor)

    const selfClosing = selfClosingRe.exec(rest)
    if (selfClosing !== null) {
      flush()
      stack[stack.length - 1]!.push({
        kind: 'element',
        token: selfClosing[1]!,
        children: [],
      })
      cursor += selfClosing[0].length
      continue
    }

    const opening = openingRe.exec(rest)
    if (opening !== null) {
      flush()
      const element: MessagePart = {
        kind: 'element',
        token: opening[1]!,
        children: [],
      }
      stack[stack.length - 1]!.push(element)
      stack.push(element.children)
      open.push(element.token)
      cursor += opening[0].length
      continue
    }

    const closing = closingRe.exec(rest)
    if (closing !== null) {
      flush()
      const expected = open.pop()
      if (expected === undefined || expected !== closing[1]) {
        fail(
          expected === undefined
            ? `unmatched </${closing[1]}>`
            : `</${closing[1]}> closes <${expected}>`,
        )
      }
      stack.pop()
      cursor += closing[0].length
      continue
    }

    const value = valueRe.exec(rest)
    // `${...}` is literal text, not a placeholder - skip the brace.
    if (value !== null && text[cursor - 1] !== '$') {
      flush()
      stack[stack.length - 1]!.push({
        kind: 'expression',
        token: value[1]!,
      })
      cursor += value[0].length
      continue
    }

    literal += text[cursor]
    cursor++
  }

  flush()
  if (open.length > 0) fail(`<${open[open.length - 1]}> is never closed`)

  return root
}

/**
 * The `{token}`s a template message mentions. `${...}` is not a placeholder -
 * it is literal text that happens to contain braces - so a brace preceded by
 * `$` does not count, on either side of the comparison.
 */
function templateTokens(text: string): Set<string> {
  return new Set(
    [...text.matchAll(new RegExp(String.raw`(?<!\$)\{${TOKEN}\}`, 'g'))].map(
      (match) => match[1]!,
    ),
  )
}

/**
 * Checks that a translation uses exactly the placeholders the source has.
 *
 * A dropped `{name}` silently loses the value it stood for; an invented one
 * has nothing to substitute. Both are translator mistakes, and both must fail
 * at build time with the message named rather than ship. The comparison is
 * against the source *text*, not the expression list, so a literal `{n}`
 * that was never a placeholder is treated the same on both sides.
 */
export function validateTemplateTranslation(
  translation: string,
  source: string,
  describe: string,
): void {
  if (translation === source) return

  const wanted = templateTokens(source)
  const got = templateTokens(translation)

  for (const token of wanted) {
    if (!got.has(token)) {
      throw new Error(
        `best-i18n: ${describe}: the translation drops {${token}} - its ` +
          `value would silently disappear. Translation: "${translation}"`,
      )
    }
  }
  for (const token of got) {
    if (!wanted.has(token)) {
      throw new Error(
        `best-i18n: ${describe}: the translation uses {${token}}, which the ` +
          `source message does not have. Translation: "${translation}"`,
      )
    }
  }
}

/**
 * Checks one plural form. Unlike a plain translation a form may *drop*
 * placeholders - "One item" legitimately has no count in it - so only
 * inventions are errors.
 */
export function validatePluralForm(
  form: string,
  allowed: ReadonlySet<string>,
  describe: string,
): void {
  for (const token of templateTokens(form)) {
    if (!allowed.has(token)) {
      throw new Error(
        `best-i18n: ${describe}: the plural form uses {${token}}, which the ` +
          `source message does not have. Form: "${form}"`,
      )
    }
  }
}

/** Every `{token}` and `<token>` mentioned in a parsed message. */
function collectTokens(
  parts: MessagePart[],
  expressions: Set<string>,
  elements: Set<string>,
): void {
  for (const part of parts) {
    if (part.kind === 'expression') {
      expressions.add(part.token)
    } else if (part.kind === 'element') {
      elements.add(part.token)
      collectTokens(part.children, expressions, elements)
    }
  }
}

/**
 * Checks that a `<Trans>` translation mentions exactly the placeholders and
 * elements the source produced.
 */
function validateTransParts(
  parts: MessagePart[],
  placeholders: string[],
  elements: TransElement[],
  describe: string,
): void {
  const gotExpressions = new Set<string>()
  const gotElements = new Set<string>()
  collectTokens(parts, gotExpressions, gotElements)

  const complain = (what: string): never => {
    throw new Error(`best-i18n: ${describe}: ${what}`)
  }

  const wantedExpressions = new Set(placeholders)
  const wantedElements = new Set(elements.map((element) => element.token))

  for (const token of wantedExpressions) {
    if (!gotExpressions.has(token)) {
      complain(
        `the translation drops {${token}} - its value would silently ` +
          'disappear.',
      )
    }
  }
  for (const token of gotExpressions) {
    if (!wantedExpressions.has(token)) {
      complain(
        `the translation uses {${token}}, which the source message does ` +
          'not have.',
      )
    }
  }
  for (const token of wantedElements) {
    if (!gotElements.has(token)) {
      complain(
        `the translation drops <${token}> - the element and everything on ` +
          'it would silently disappear.',
      )
    }
  }
  for (const token of gotElements) {
    if (!wantedElements.has(token)) {
      complain(
        `the translation uses <${token}>, which the source message does ` +
          'not have.',
      )
    }
  }
}

/** Escapes text so it can be embedded in a template literal. */
export function escapeTemplate(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
}

/** The expression a token stands for, or undefined for a literal `{...}`. */
function expressionFor(
  token: string,
  expressions: string[],
  placeholders: string[],
): string | undefined {
  const index = placeholders.indexOf(token)
  return index === -1 ? undefined : expressions[index]
}

/** Builds a template literal, substituting `{token}` with expressions. */
export function renderTemplate(
  text: string,
  expressions: string[],
  placeholders: string[],
): string {
  // escapeTemplate turned a literal `${` into `\${`, so a placeholder here
  // is exactly a brace not preceded by `$`.
  const body = escapeTemplate(text).replace(
    new RegExp(String.raw`(?<!\$)\{${TOKEN}\}`, 'g'),
    (whole, token: string) => {
      const expression = expressionFor(token, expressions, placeholders)
      return expression === undefined ? whole : `\${${expression}}`
    },
  )

  return `\`${body}\``
}

function hasElement(parts: MessagePart[]): boolean {
  return parts.some((part) => part.kind === 'element')
}

/**
 * A run of text and expressions, as one template literal.
 *
 * A run that is exactly one expression stays an expression: template-literal
 * interpolation would stringify it, turning a ReactNode into
 * `[object Object]` and `null` into the visible word "null". Only a run that
 * mixes text and expressions has to concatenate, which is inherently
 * stringly - don't put ReactNodes in the middle of a sentence.
 */
function renderFlat(
  parts: MessagePart[],
  expressions: string[],
  placeholders: string[],
): string {
  const only = parts.length === 1 ? parts[0] : undefined
  if (only !== undefined && only.kind === 'expression') {
    return `(${expressionFor(only.token, expressions, placeholders)!})`
  }

  let body = ''

  for (const part of parts) {
    if (part.kind === 'text') {
      body += escapeTemplate(part.value)
    } else if (part.kind === 'expression') {
      body += `\${${expressionFor(part.token, expressions, placeholders) ?? ''}}`
    }
  }

  return `\`${body}\``
}

/**
 * Emits the children of a JSX element.
 *
 * Runs of text and expressions collapse into one `{`...`}` child rather than
 * one per part, and nothing is emitted between children: whitespace between
 * JSX children is itself a text node, so pretty-printing here would change
 * what renders.
 */
function renderChildren(
  parts: MessagePart[],
  expressions: string[],
  placeholders: string[],
  elements: TransElement[],
  describe: string,
): string {
  let out = ''
  let run: MessagePart[] = []

  const flushRun = () => {
    if (run.length === 0) return
    out += `{${renderFlat(run, expressions, placeholders)}}`
    run = []
  }

  for (const part of parts) {
    if (part.kind !== 'element') {
      run.push(part)
      continue
    }

    flushRun()

    const element = elements.find((item) => item.token === part.token)
    if (element === undefined) {
      throw new Error(
        `best-i18n: ${describe}: <${part.token}> has no matching element in ` +
          'the source message.',
      )
    }

    if (element.selfClosing) {
      if (part.children.length > 0) {
        throw new Error(
          `best-i18n: ${describe}: <${part.token}> is self-closing in the ` +
            'source, so it cannot be given content.',
        )
      }
      out += element.open
      continue
    }

    out +=
      element.open +
      renderChildren(
        part.children,
        expressions,
        placeholders,
        elements,
        describe,
      ) +
      element.close
  }

  flushRun()

  return out
}

/**
 * Rebuilds one locale's version of a `<Trans>` as an ordinary JSX expression.
 *
 * A message with no markup left in it comes back as a plain template literal,
 * so the common case costs exactly what `t` would.
 */
export function renderTrans(
  text: string,
  expressions: string[],
  placeholders: string[],
  elements: TransElement[],
  describe: string,
): string {
  const parts = parseMessage(text, describe)
  validateTransParts(parts, placeholders, elements, describe)

  if (!hasElement(parts)) return renderFlat(parts, expressions, placeholders)

  return `<>${renderChildren(parts, expressions, placeholders, elements, describe)}</>`
}
