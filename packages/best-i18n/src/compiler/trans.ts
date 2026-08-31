/**
 * `<Trans>` is the half of the macro that a tagged template cannot reach: a
 * message whose shape includes markup, so a translator can move a link or a
 * bold run to wherever their language wants it.
 *
 * The message is stored with the markup replaced by numbered placeholders -
 * `Read the <0>docs</0>` - which is the same convention Lingui uses, and for
 * the same reason: a translator should never have to see, or be able to break,
 * a JSX attribute. Only the ordering is theirs.
 *
 * Where this parts ways with Lingui is what happens at build time. There is no
 * runtime component putting the pieces back together per render: the parts are
 * reassembled here, once, into ordinary JSX per locale, so what ships is the
 * markup itself.
 */

/** An element placeholder, kept as source so its attributes survive intact. */
export interface TransElement {
  /** `<a href={url}>`, or the whole element when it is self-closing. */
  open: string
  /** `</a>`, empty for a self-closing element. */
  close: string
  selfClosing: boolean
}

export interface TransMessage {
  text: string
  expressions: string[]
  elements: TransElement[]
}

export type MessagePart =
  | { kind: 'text'; value: string }
  | { kind: 'expression'; index: number }
  | { kind: 'element'; index: number; children: MessagePart[] }

interface JsxNode {
  type?: string
  value?: string
  raw?: string
  start?: number
  end?: number
  expression?: JsxNode
  children?: JsxNode[]
  openingElement?: { start?: number; end?: number; selfClosing?: boolean }
  closingElement?: { start?: number; end?: number } | null
  openingFragment?: { start?: number; end?: number }
  closingFragment?: { start?: number; end?: number } | null
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
  const elements: TransElement[] = []

  const text = serializeChildren(
    children as JsxNode[],
    code,
    filename,
    expressions,
    elements,
  )

  return { text, expressions, elements }
}

function serializeChildren(
  children: JsxNode[],
  code: string,
  filename: string,
  expressions: string[],
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

        out += `{${expressions.length}}`
        expressions.push(
          code.slice(expression.start as number, expression.end as number),
        )
        break
      }

      case 'JSXElement':
      case 'JSXFragment': {
        // Reserved before recursing, so the numbering reads outside-in.
        const index = elements.length
        elements.push({ open: '', close: '', selfClosing: false })

        const isFragment = child.type === 'JSXFragment'
        const opening = isFragment
          ? child.openingFragment
          : child.openingElement
        const closing = isFragment
          ? child.closingFragment
          : child.closingElement
        const selfClosing = child.openingElement?.selfClosing === true

        elements[index] = {
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
              elements,
            )

        out += inner === '' ? `<${index}/>` : `<${index}>${inner}</${index}>`
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
  const open: number[] = []
  let cursor = 0
  let literal = ''

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

    const selfClosing = /^<(\d+)\s*\/>/.exec(rest)
    if (selfClosing !== null) {
      flush()
      stack[stack.length - 1]!.push({
        kind: 'element',
        index: Number(selfClosing[1]),
        children: [],
      })
      cursor += selfClosing[0].length
      continue
    }

    const opening = /^<(\d+)>/.exec(rest)
    if (opening !== null) {
      flush()
      const element: MessagePart = {
        kind: 'element',
        index: Number(opening[1]),
        children: [],
      }
      stack[stack.length - 1]!.push(element)
      stack.push(element.children)
      open.push(element.index)
      cursor += opening[0].length
      continue
    }

    const closing = /^<\/(\d+)>/.exec(rest)
    if (closing !== null) {
      flush()
      const expected = open.pop()
      if (expected === undefined || expected !== Number(closing[1])) {
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

    const value = /^\{(\d+)\}/.exec(rest)
    if (value !== null) {
      flush()
      stack[stack.length - 1]!.push({
        kind: 'expression',
        index: Number(value[1]),
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

/** The `{n}` indices a template message mentions. */
function templateIndices(text: string): Set<number> {
  return new Set(
    [...text.matchAll(/\{(\d+)\}/g)].map((match) => Number(match[1])),
  )
}

/**
 * Checks that a translation uses exactly the placeholders the source has.
 *
 * A dropped `{0}` silently loses the value it stood for; an invented one has
 * nothing to substitute. Both are translator mistakes, and both must fail at
 * build time with the message named rather than ship. The comparison is
 * against the source *text*, not the expression count, so a literal `{n}`
 * that was never a placeholder is treated the same on both sides.
 */
export function validateTemplateTranslation(
  translation: string,
  source: string,
  describe: string,
): void {
  if (translation === source) return

  const wanted = templateIndices(source)
  const got = templateIndices(translation)

  for (const index of wanted) {
    if (!got.has(index)) {
      throw new Error(
        `best-i18n: ${describe}: the translation drops {${index}} - its ` +
          `value would silently disappear. Translation: "${translation}"`,
      )
    }
  }
  for (const index of got) {
    if (!wanted.has(index)) {
      throw new Error(
        `best-i18n: ${describe}: the translation uses {${index}}, which the ` +
          `source message does not have. Translation: "${translation}"`,
      )
    }
  }
}

/** Every `{n}` and `<n>` index mentioned in a parsed message. */
function collectIndices(
  parts: MessagePart[],
  expressions: Set<number>,
  elements: Set<number>,
): void {
  for (const part of parts) {
    if (part.kind === 'expression') {
      expressions.add(part.index)
    } else if (part.kind === 'element') {
      elements.add(part.index)
      collectIndices(part.children, expressions, elements)
    }
  }
}

/**
 * Checks that a `<Trans>` translation mentions exactly the placeholders and
 * elements the source produced. `<Trans>` placeholders are always generated -
 * JSX text cannot contain a bare `{` - so the source sets are simply
 * `0..count-1` on both axes.
 */
function validateTransParts(
  parts: MessagePart[],
  expressionCount: number,
  elementCount: number,
  describe: string,
): void {
  const expressions = new Set<number>()
  const elements = new Set<number>()
  collectIndices(parts, expressions, elements)

  const complain = (what: string): never => {
    throw new Error(`best-i18n: ${describe}: ${what}`)
  }

  for (let index = 0; index < expressionCount; index++) {
    if (!expressions.has(index)) {
      complain(
        `the translation drops {${index}} - its value would silently ` +
          'disappear.',
      )
    }
  }
  for (const index of expressions) {
    if (index >= expressionCount) {
      complain(
        `the translation uses {${index}}, which the source message does ` +
          'not have.',
      )
    }
  }
  for (let index = 0; index < elementCount; index++) {
    if (!elements.has(index)) {
      complain(
        `the translation drops <${index}> - the element and everything on ` +
          'it would silently disappear.',
      )
    }
  }
  for (const index of elements) {
    if (index >= elementCount) {
      complain(
        `the translation uses <${index}>, which the source message does ` +
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

/** Builds a template literal for `text`, substituting `{n}` with expressions. */
export function renderTemplate(text: string, expressions: string[]): string {
  const body = escapeTemplate(text).replace(
    /\{(\d+)\}/g,
    (whole, index: string) => {
      const expression = expressions[Number(index)]
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
function renderFlat(parts: MessagePart[], expressions: string[]): string {
  const only = parts.length === 1 ? parts[0] : undefined
  if (only !== undefined && only.kind === 'expression') {
    return `(${expressions[only.index]!})`
  }

  let body = ''

  for (const part of parts) {
    if (part.kind === 'text') {
      body += escapeTemplate(part.value)
    } else if (part.kind === 'expression') {
      body += `\${${expressions[part.index] ?? ''}}`
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
  elements: TransElement[],
  describe: string,
): string {
  let out = ''
  let run: MessagePart[] = []

  const flushRun = () => {
    if (run.length === 0) return
    out += `{${renderFlat(run, expressions)}}`
    run = []
  }

  for (const part of parts) {
    if (part.kind !== 'element') {
      run.push(part)
      continue
    }

    flushRun()

    const element = elements[part.index]
    if (element === undefined) {
      throw new Error(
        `best-i18n: ${describe}: <${part.index}> has no matching element in ` +
          'the source message.',
      )
    }

    if (element.selfClosing) {
      if (part.children.length > 0) {
        throw new Error(
          `best-i18n: ${describe}: <${part.index}> is self-closing in the ` +
            'source, so it cannot be given content.',
        )
      }
      out += element.open
      continue
    }

    out +=
      element.open +
      renderChildren(part.children, expressions, elements, describe) +
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
  elements: TransElement[],
  describe: string,
): string {
  const parts = parseMessage(text, describe)
  validateTransParts(parts, expressions.length, elements.length, describe)

  if (!hasElement(parts)) return renderFlat(parts, expressions)

  return `<>${renderChildren(parts, expressions, elements, describe)}</>`
}
