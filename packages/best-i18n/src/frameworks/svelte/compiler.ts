import { parseJsx } from '../../compiler/jsx.ts'
import {
  REACT_MACRO_MODULE,
  SVELTE_MACRO_MODULE,
  SVELTE_MODULE,
} from '../../compiler/modules.ts'
import {
  decodeEntities,
  tokenForElement,
  tokenForExpression,
} from '../../compiler/trans.ts'
import { parseSvelte } from './parse.ts'
import type {
  FrameworkAdapter,
  ParsedFile,
  TransContext,
  TransMatch,
} from '../../compiler/adapter.ts'
import type { TransElement, TransMessage } from '../../compiler/trans.ts'
import type { Message } from '../../compiler/transform.ts'
import type { SvelteScript } from './parse.ts'
import type { MagicString } from 'magic-string'

/** `.svelte` components and `.svelte.ts` / `.svelte.js` rune modules. */
export const SVELTE_FILE = /\.svelte(?:\.[jt]s)?$/

interface SvelteParsedFile extends ParsedFile {
  /** The component's `<script>` elements, so an emptied one can be dropped. */
  scripts: SvelteScript[]
}

interface SvelteTemplateNode {
  type?: string
  start?: number
  end?: number
  raw?: string
  data?: string
  name?: string
  expression?: { type?: string; start?: number; end?: number }
  fragment?: { nodes?: SvelteTemplateNode[] }
}

/**
 * Same stored message as `serializeTrans`, from a Svelte template rather than
 * JSX: `{name}` is an ExpressionTag, `<a>` a RegularElement, `<Button>` a
 * Component. Blocks, `{@html}` and the rest stay out — they are not a
 * sentence a translator can reorder.
 */
export function serializeSvelteTrans(
  children: readonly unknown[],
  code: string,
  filename: string,
): TransMessage {
  const expressions: string[] = []
  const placeholders: string[] = []
  const elements: TransElement[] = []

  const text = serializeSvelteChildren(
    children as SvelteTemplateNode[],
    code,
    filename,
    expressions,
    placeholders,
    elements,
  )

  return { text, expressions, placeholders, elements }
}

const SVELTE_WS_START = /^[ \t\r\n]+/
const SVELTE_WS_END = /[ \t\r\n]+$/
const SVELTE_WS_RUN = /[ \t\r\n]+/g

/**
 * Whitespace the way Svelte's compiler treats a fragment (`clean_nodes`), not
 * the way JSX does: a line break next to an element is one space, not
 * nothing, so a `<Trans>` reads the same as the component renders. The first
 * and last text of the fragment lose their outer whitespace, text following
 * text that already ends in whitespace loses its leading run, and every other
 * run collapses to one space.
 */
function cleanSvelteText(nodes: SvelteTemplateNode[], index: number): string {
  const raw = (node: SvelteTemplateNode) => node.raw ?? node.data ?? ''
  let text = raw(nodes[index]!).replace(SVELTE_WS_RUN, ' ')
  const previous = nodes[index - 1]
  if (
    previous === undefined ||
    (previous.type === 'Text' && SVELTE_WS_END.test(raw(previous)))
  ) {
    text = text.replace(SVELTE_WS_START, '')
  }
  if (nodes[index + 1] === undefined) text = text.replace(SVELTE_WS_END, '')
  return text
}

function serializeSvelteChildren(
  children: SvelteTemplateNode[],
  code: string,
  filename: string,
  expressions: string[],
  placeholders: string[],
  elements: TransElement[],
): string {
  let out = ''
  // Comments vanish before Svelte looks at whitespace, so the text on either
  // side of one is neighbours for the rules below.
  const nodes = children.filter((child) => child.type !== 'Comment')

  for (const [index, child] of nodes.entries()) {
    switch (child.type) {
      case 'Text': {
        out += decodeEntities(cleanSvelteText(nodes, index))
        break
      }

      case 'ExpressionTag': {
        const expression = child.expression
        if (expression === undefined) break
        const source = code.slice(
          expression.start as number,
          expression.end as number,
        )
        out += `{${tokenForExpression(source, expressions, placeholders)}}`
        break
      }

      case 'RegularElement':
      case 'Component':
      case 'SvelteElement':
      case 'SvelteFragment': {
        const nodes = child.fragment?.nodes ?? []
        const name =
          child.type === 'RegularElement' || child.type === 'Component'
            ? child.name
            : undefined
        const token = tokenForElement(
          name,
          elements.map((element) => element.token),
        )
        const index = elements.length
        elements.push({ token, open: '', close: '', selfClosing: false })

        const selfClosing = nodes.length === 0
        elements[index] = {
          token,
          open: selfClosing
            ? code.slice(child.start as number, child.end as number)
            : code.slice(child.start as number, nodes[0]!.start as number),
          close: selfClosing
            ? ''
            : code.slice(
                nodes[nodes.length - 1]!.end as number,
                child.end as number,
              ),
          selfClosing,
        }

        const inner = selfClosing
          ? ''
          : serializeSvelteChildren(
              nodes,
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

/** A `<Trans>...</Trans>` component in a Svelte template, read into a message. */
function matchSvelteTrans(
  node: Record<string, unknown>,
  _parent: Record<string, unknown> | undefined,
  { code, filename, component, componentLocals }: TransContext,
): TransMatch | undefined {
  if (node.type !== 'Component' || !componentLocals.has(node.name as string)) {
    return undefined
  }

  const start = node.start as number
  let context = ''
  for (const attribute of (node.attributes ?? []) as Array<
    Record<string, unknown>
  >) {
    if (attribute.type === 'Attribute' && attribute.name === 'ctx') {
      const value = attribute.value as
        | Array<{ type?: string; data?: string }>
        | undefined
      const text = value?.length === 1 ? value[0] : undefined
      if (
        text?.type !== 'Text' ||
        typeof text.data !== 'string' ||
        text.data === ''
      ) {
        throw new Error(
          `best-i18n: <${component} ctx> must be a non-empty string ` +
            `literal (${filename} offset ${start}).`,
        )
      }
      context = text.data
      continue
    }
    throw new Error(
      `best-i18n: <${component}> takes no props other than ctx ` +
        `(${filename} offset ${start}). Wrap it in an element if you ` +
        'need one.',
    )
  }

  const nodes =
    (node.fragment as { nodes?: unknown[] } | undefined)?.nodes ?? []
  const { text, expressions, placeholders, elements } = serializeSvelteTrans(
    nodes,
    code,
    filename,
  )
  // Self-closing, or nothing but whitespace and comments once Svelte's
  // whitespace rules have run: either way there is no message.
  if (text === '') {
    throw new Error(
      `best-i18n: <${component} /> is empty (${filename} offset ${start}). ` +
        'A message needs content.',
    )
  }

  return {
    text,
    expressions,
    placeholders,
    elements,
    context,
    start,
    end: node.end as number,
    // A text-only message is a JS expression and needs braces in the
    // template. Markup becomes `{#if}` / children, which is already template
    // syntax.
    braced: elements.length === 0,
    elementOk: false,
    svelte: true,
  }
}

/**
 * Svelte 5: a component is up to two scripts plus a template, `<Trans>` is a
 * `Component` node, and markup cannot live inside `{...}` - so a message with
 * markup becomes an `{#if}` chain in the template rather than a JS ternary.
 * The locale is read through `best-i18n/svelte`, which runes track.
 */
export const svelte: FrameworkAdapter<SvelteParsedFile> = {
  name: 'svelte',
  runtimeModule: SVELTE_MODULE,
  componentModule: SVELTE_MACRO_MODULE,
  clientDirectives: false,
  transFragment: false,

  parse(code, filename) {
    const cleanName = filename.split('?')[0] ?? filename
    // A rune module is ordinary TypeScript; only its locale read is Svelte's.
    if (!cleanName.endsWith('.svelte')) {
      return { ...parseJsx(code, filename), scripts: [] }
    }
    const { contexts, insertion, scripts } = parseSvelte(code, filename)
    return { contexts, directiveEnd: insertion, directives: [], scripts }
  },

  checkImports(imports, { hook, hookFrom, component }) {
    for (const declaration of imports) {
      const request = declaration.moduleRequest.value
      if (
        (hookFrom.includes(request) || request === REACT_MACRO_MODULE) &&
        declaration.entries.some(
          (entry) =>
            !entry.isType &&
            (entry.importName.name === hook ||
              entry.importName.name === component),
        )
      ) {
        throw new Error(
          'best-i18n: Svelte supports t, plural, and <Trans> from ' +
            `${SVELTE_MACRO_MODULE}; React macros are not supported.`,
        )
      }
    }
  },

  matchTrans: matchSvelteTrans,

  // An `{#if}` block is template syntax, not an expression: it cannot be the
  // body of a shared function. Text-only messages are expressions and can.
  hoistable: (message: Message) => (message.elements?.length ?? 0) === 0,

  // Svelte cannot put elements inside `{...}`, so markup becomes a template
  // `{#if}` rather than a JS ternary of fragments.
  renderMarkupBranches(_message, base, branches, localeExpr) {
    const chain = branches.map(
      ({ locale, rendered }, index) =>
        `${
          index === 0
            ? `{#if ${localeExpr} === ${JSON.stringify(locale)}}`
            : `{:else if ${localeExpr} === ${JSON.stringify(locale)}}`
        }${rendered}`,
    )
    return `${chain.join('')}{:else}${base}{/if}`
  },

  // A `<script>` that held nothing but macro imports is now blank. Drop the
  // element rather than leave an empty one behind - except the script the
  // injected statements went into, which `slice` does not show.
  finalize(source: MagicString, code, { scripts, directiveEnd }, injected) {
    for (const script of scripts) {
      if (injected && script.contentStart === directiveEnd) continue
      if (source.slice(script.contentStart, script.contentEnd).trim() !== '') {
        continue
      }
      const end = code[script.end] === '\n' ? script.end + 1 : script.end
      source.remove(script.start, end)
    }
  },
}
