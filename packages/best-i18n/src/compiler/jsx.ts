import { parseSync } from 'oxc-parser'
import { serializeTrans } from './trans.ts'
import type { ParsedFile, TransContext, TransMatch } from './adapter.ts'
import type { StaticImport } from './bindings.ts'
import type { ExplicitLocale } from './message.ts'

/**
 * The JSX half of the compiler, shared by every framework whose components
 * are JSX modules: how such a file parses, and what its `<Trans>` looks like.
 */

type Lang = 'ts' | 'tsx' | 'js' | 'jsx'

// Plain `.js` (and `.mjs`/`.cjs`) parses as JSX: Next.js and CRA-style code
// put JSX in `.js` routinely, and JSX is a syntactic superset of JS, so
// nothing is lost by assuming it. TypeScript is the opposite - JSX in `.ts`
// is ambiguous with type assertions - so only `.tsx` gets it there.
const LANGS = new Map<string, Lang>([
  ['ts', 'ts'],
  ['tsx', 'tsx'],
  ['mts', 'ts'],
  ['cts', 'ts'],
  ['js', 'jsx'],
  ['jsx', 'jsx'],
  ['mjs', 'jsx'],
  ['cjs', 'jsx'],
])

/**
 * End offset of the leading directive prologue (`'use client'`, `'use server'`).
 *
 * Injected imports have to go after it: a directive that is no longer the first
 * statement in the file is just a string expression, so prepending would
 * silently turn a client component into a server one.
 */
function directivePrologue(program: unknown): {
  end: number
  directives: string[]
} {
  const body =
    (program as { body?: Array<Record<string, unknown>> } | undefined)?.body ??
    []
  let end = 0
  const directives: string[] = []

  for (const statement of body) {
    if (statement.type !== 'ExpressionStatement') break
    const expression = statement.expression as
      | { type?: string; value?: unknown }
      | undefined
    if (
      expression?.type !== 'Literal' ||
      typeof expression.value !== 'string'
    ) {
      break
    }
    end = statement.end as number
    directives.push(expression.value)
  }

  return { end, directives }
}

/** Parses a JS/TS module, JSX included, into one analysis context. */
export function parseJsx(code: string, filename: string): ParsedFile {
  // Module ids carry query strings (TanStack Router appends `?tsr-split=...`,
  // vite appends `?url` etc.), so strip them before looking at the extension.
  // Guessing `ts` for a `.tsx` file makes the parser read JSX as a type
  // assertion and fail.
  const cleanName = filename.split('?')[0] ?? filename
  const extension = cleanName.split('.').pop() ?? 'ts'
  const lang = LANGS.get(extension) ?? 'ts'

  const parsed = parseSync(filename, code, { sourceType: 'module', lang })
  const { end, directives } = directivePrologue(parsed.program)

  return {
    contexts: [
      {
        program: parsed.program,
        module: {
          staticImports: parsed.module.staticImports as StaticImport[],
        },
        comments: parsed.comments,
        errors: parsed.errors,
      },
    ],
    directiveEnd: end,
    directives,
  }
}

/** A `<Trans>...</Trans>` JSX element, read into a message. */
export function matchJsxTrans(
  node: Record<string, unknown>,
  parent: Record<string, unknown> | undefined,
  {
    code,
    filename,
    component,
    componentLocals,
    parentOf,
    takesElement,
  }: TransContext,
): TransMatch | undefined {
  if (node.type !== 'JSXElement') return undefined

  const opening = node.openingElement as
    | {
        name?: { type?: string; name?: string }
        attributes?: Array<Record<string, unknown>>
        selfClosing?: boolean
      }
    | undefined

  if (opening?.name?.type !== 'JSXIdentifier') return undefined
  if (!componentLocals.has(opening.name.name ?? '')) return undefined

  const start = node.start as number

  // Attributes would have to survive translation, and none of them can:
  // there is nowhere in the message to put them. `key` included - wrap the
  // <Trans> in the element that needs it. `ctx` is the one exception: it is
  // message metadata, not a prop.
  let context = ''
  let explicitLocale: ExplicitLocale | undefined
  for (const attribute of opening.attributes ?? []) {
    const attributeName = (attribute.name as { name?: string } | undefined)
      ?.name
    if (attribute.type === 'JSXAttribute' && attributeName === 'locale') {
      explicitLocale = jsxLocaleValue(attribute.value, code)
      if (explicitLocale === undefined) {
        throw new Error(
          `best-i18n: <${component} locale> needs a value ` +
            `(${filename} offset ${start}).`,
        )
      }
      continue
    }
    if (attribute.type === 'JSXAttribute' && attributeName === 'ctx') {
      const value = attribute.value as
        | { type?: string; value?: unknown }
        | null
        | undefined
      if (
        value?.type !== 'Literal' ||
        typeof value.value !== 'string' ||
        value.value === ''
      ) {
        throw new Error(
          `best-i18n: <${component} ctx> must be a non-empty string ` +
            `literal (${filename} offset ${start}).`,
        )
      }
      context = value.value
      continue
    }
    throw new Error(
      `best-i18n: <${component}> takes no props other than ctx ` +
        `(${filename} offset ${start}). Wrap it in an element if you ` +
        'need one.',
    )
  }

  if (opening.selfClosing === true) {
    throw new Error(
      `best-i18n: <${component} /> is empty (${filename} offset ${start}). ` +
        'A message needs content.',
    )
  }

  const { text, expressions, placeholders, elements } = serializeTrans(
    node.children as unknown[],
    code,
    filename,
  )

  return {
    text,
    expressions,
    placeholders,
    elements,
    context,
    start,
    end: node.end as number,
    // Among JSX children the replacement has to stay an expression; anywhere
    // else - a variable, a prop, a return - it already is one.
    braced: parent?.type === 'JSXElement' || parent?.type === 'JSXFragment',
    ...(parent?.type === 'JSXExpressionContainer' &&
    parentOf.get(parent)?.type === 'JSXAttribute'
      ? { attribute: true }
      : {}),
    elementOk: takesElement(node),
    ...(explicitLocale === undefined ? {} : { explicitLocale }),
  }
}

/** `locale="zh"` or `locale={expr}` on a JSX `<Trans>`. */
function jsxLocaleValue(
  value: unknown,
  code: string,
): ExplicitLocale | undefined {
  const node = value as
    | { type?: string; value?: unknown; expression?: Record<string, unknown> }
    | null
    | undefined
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return { source: JSON.stringify(node.value), literal: node.value }
  }
  if (node?.type === 'JSXExpressionContainer' && node.expression) {
    const expression = node.expression
    if (expression.type === 'JSXEmptyExpression') return undefined
    const source = code.slice(
      expression.start as number,
      expression.end as number,
    )
    return expression.type === 'Literal' && typeof expression.value === 'string'
      ? { source, literal: expression.value }
      : { source }
  }
  return undefined
}
