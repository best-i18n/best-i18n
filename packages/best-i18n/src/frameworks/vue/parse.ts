import { parseSync } from 'oxc-parser'
import { requireFromProject } from '../../compiler/resolve.ts'
import type { ParsedSource } from '../../compiler/adapter.ts'
import type { StaticImport } from '../../compiler/bindings.ts'

/** A `<script>` block of the component, with the range of its content. */
export interface VueScript {
  start: number
  end: number
  contentStart: number
  contentEnd: number
  setup: boolean
  lang: string | undefined
}

/**
 * A JavaScript expression in the template - an interpolation or a directive
 * value - with the quote that delimits it when it is an attribute value, so
 * a replacement can be re-quoted to survive there.
 */
export interface VueExpression {
  start: number
  end: number
  quote: '"' | "'" | undefined
}

/**
 * The template, re-shaped for the shared walker: a node has a string `type`,
 * a `start` and an `end`, and children under `children`. Vue's own AST keys
 * its nodes by number, which the walker does not treat as nodes.
 */
export interface VueTemplateNode {
  type:
    | 'VueTemplate'
    | 'VueElement'
    | 'VueText'
    | 'VueInterpolation'
    | 'VueComment'
    | 'VueOther'
  start: number
  end: number
  /** `VueElement`: the tag as written. */
  tag?: string
  /** `VueElement`: `true` for `<br />` and for `<b></b>` alike - no children. */
  selfClosing?: boolean
  props?: VueProp[]
  children?: VueTemplateNode[]
  /** `VueText`: the content after Vue's whitespace condensing. */
  text?: string
  /** `VueInterpolation`: the expression's source and range. */
  expression?: { source: string; start: number; end: number }
  /** `VueOther`: what it was, for the error message. */
  kind?: string
}

export interface VueProp {
  /** A plain attribute (`ctx="verb"`) or a directive (`:href`, `v-if`). */
  kind: 'attribute' | 'directive'
  /** `ctx` for the attribute, `bind` / `on` / `if` for a directive. */
  name: string
  /** `ctx="verb"` -> `verb`. Attributes only. */
  value?: string
  /** `:locale="lang"` -> `locale`. Directives with an argument only. */
  arg?: string
  /** `:locale="lang"` -> `lang`. Directives with a value only. */
  expression?: string
  start: number
  end: number
}

// The numbers @vue/compiler-core uses for `node.type`.
const ROOT = 0
const ELEMENT = 1
const TEXT = 2
const COMMENT = 3
const INTERPOLATION = 5
const ATTRIBUTE = 6
const DIRECTIVE = 7

/** Directives whose value is not a JavaScript expression. */
const NON_EXPRESSION_DIRECTIVES = new Set([
  'for',
  'slot',
  'pre',
  'once',
  'memo',
])

interface Loc {
  start: { offset: number }
  end: { offset: number }
  source: string
}

interface RawNode {
  type: number
  loc: Loc
  tag?: string
  tagType?: number
  isSelfClosing?: boolean
  props?: Array<{
    type: number
    name: string
    rawName?: string
    value?: { content: string } | undefined
    exp?: { content: string; loc: Loc } | undefined
    arg?: { content: string } | undefined
    loc: Loc
  }>
  children?: RawNode[]
  content?: string | { content: string; loc: Loc }
}

interface Descriptor {
  script: RawBlock | null
  scriptSetup: RawBlock | null
  template: { ast?: RawNode; loc: Loc } | null
}

interface RawBlock {
  loc: Loc
  lang?: string
  setup?: boolean | string
}

interface CompilerSfc {
  parse: (
    source: string,
    options: {
      filename: string
      templateParseOptions?: { comments?: boolean }
    },
  ) => {
    descriptor: Descriptor
    errors: Array<{ message: string }>
  }
}

/**
 * Parses a `.vue` single-file component into analysis contexts: each
 * `<script>` block, each template expression on its own, and the template
 * tree for the `<Trans>` matcher.
 */
export function parseVue(
  code: string,
  filename: string,
): {
  contexts: ParsedSource[]
  /** Where injected statements go: the start of `<script setup>`, or `0`. */
  insertion: number
  scripts: VueScript[]
  expressions: VueExpression[]
  /** `true` when a script block exists to inject into. */
  hasSetup: boolean
  /** `lang` of the first script block that names one, for a generated block. */
  lang: string | undefined
} {
  const sfc = requireFromProject<CompilerSfc>(
    'vue/compiler-sfc',
    filename,
    'install vue@^3.3 to translate .vue files.',
  )
  const { descriptor, errors } = sfc.parse(code, {
    filename,
    templateParseOptions: { comments: true },
  })
  // The SFC parser also tries every template expression as JavaScript and
  // reports what it could not read. Those are parsed again below with oxc,
  // with real offsets, and rejected there if they are really broken.
  const real = errors.filter(
    (error) => !error.message.startsWith('Error parsing JavaScript expression'),
  )
  if (real.length > 0) {
    throw new Error(
      `best-i18n: failed to parse ${filename}: ${real[0]!.message}`,
    )
  }

  // Every non-newline character becomes a space, so a slice of the original
  // dropped into it keeps its offsets and its line numbers.
  const blank = code.replace(/[^\r\n]/g, ' ')

  const langOf = (lang: string | undefined): 'ts' | 'tsx' =>
    lang === 'tsx' || lang === 'jsx' ? 'tsx' : 'ts'

  const parseScript = (block: RawBlock): ParsedSource => {
    const { offset: start } = block.loc.start
    const { offset: end } = block.loc.end
    const padded = blank.slice(0, start) + code.slice(start, end)
    const parsed = parseSync(`${filename}.${langOf(block.lang)}`, padded, {
      lang: langOf(block.lang),
      sourceType: 'module',
    })
    return {
      program: parsed.program,
      module: { staticImports: parsed.module.staticImports as StaticImport[] },
      comments: parsed.comments,
      errors: parsed.errors,
    }
  }

  const scripts: VueScript[] = []
  const blockOf = (block: RawBlock, setup: boolean): VueScript => {
    // `loc` is the content; the element around it is found in the source.
    const contentStart = block.loc.start.offset
    const contentEnd = block.loc.end.offset
    const start = code.lastIndexOf('<script', contentStart)
    const close = code.indexOf('</script>', contentEnd)
    return {
      start,
      end: close + '</script>'.length,
      contentStart,
      contentEnd,
      setup,
      lang: block.lang,
    }
  }

  const script = descriptor.script ? parseScript(descriptor.script) : undefined
  const setup = descriptor.scriptSetup
    ? parseScript(descriptor.scriptSetup)
    : undefined
  if (descriptor.script) scripts.push(blockOf(descriptor.script, false))
  if (descriptor.scriptSetup) {
    scripts.push(blockOf(descriptor.scriptSetup, true))
  }

  // Only `<script setup>` bindings are visible to the template, so the
  // template's expressions resolve macros against its imports alone.
  const setupImports = setup?.module.staticImports ?? []

  const contexts: ParsedSource[] = []
  if (script) contexts.push(script)
  if (setup) contexts.push(setup)

  const expressions: VueExpression[] = []
  const comments: Array<{ value: string; end: number }> = []

  /**
   * One template expression as its own context, padded to the file's
   * offsets. `(expr)` first, so an object literal is not read as a block;
   * a `v-on` handler may be statements, which only parse bare.
   */
  const expressionContext = (start: number, end: number): ParsedSource => {
    const attempt = (wrap: boolean) => {
      let padded =
        blank.slice(0, start) + code.slice(start, end) + blank.slice(end)
      if (wrap) {
        padded = `${padded.slice(0, start - 1)}(${padded.slice(start, end)})${padded.slice(end + 1)}`
      }
      return parseSync(`${filename}.ts`, padded, {
        lang: 'ts',
        sourceType: 'module',
      })
    }
    let parsed = attempt(true)
    if (parsed.errors.length > 0) parsed = attempt(false)
    return {
      program: parsed.program,
      module: { staticImports: setupImports },
      comments,
      errors: parsed.errors,
    }
  }

  const convert = (node: RawNode): VueTemplateNode => {
    const start = node.loc.start.offset
    const end = node.loc.end.offset
    switch (node.type) {
      case ELEMENT: {
        const children = (node.children ?? []).map(convert)
        const props: VueProp[] = (node.props ?? []).map((prop) => ({
          kind: prop.type === ATTRIBUTE ? 'attribute' : 'directive',
          name: prop.name,
          ...(prop.type === ATTRIBUTE && prop.value !== undefined
            ? { value: prop.value.content }
            : {}),
          ...(prop.type === DIRECTIVE && prop.arg !== undefined
            ? { arg: prop.arg.content }
            : {}),
          ...(prop.type === DIRECTIVE && prop.exp !== undefined
            ? { expression: prop.exp.content }
            : {}),
          start: prop.loc.start.offset,
          end: prop.loc.end.offset,
        }))
        for (const prop of node.props ?? []) {
          if (prop.type !== DIRECTIVE || prop.exp === undefined) continue
          if (NON_EXPRESSION_DIRECTIVES.has(prop.name)) continue
          const quote = code[prop.exp.loc.start.offset - 1]
          expressions.push({
            start: prop.exp.loc.start.offset,
            end: prop.exp.loc.end.offset,
            quote: quote === '"' || quote === "'" ? quote : undefined,
          })
        }
        return {
          type: 'VueElement',
          start,
          end,
          tag: node.tag!,
          selfClosing: node.isSelfClosing === true || children.length === 0,
          props,
          children,
        }
      }
      case TEXT:
        return { type: 'VueText', start, end, text: node.content as string }
      case INTERPOLATION: {
        const content = node.content as { content: string; loc: Loc }
        expressions.push({
          start: content.loc.start.offset,
          end: content.loc.end.offset,
          quote: undefined,
        })
        return {
          type: 'VueInterpolation',
          start,
          end,
          expression: {
            source: content.content,
            start: content.loc.start.offset,
            end: content.loc.end.offset,
          },
        }
      }
      case COMMENT:
        comments.push({ value: node.content as string, end })
        return { type: 'VueComment', start, end }
      default:
        return {
          type: 'VueOther',
          start,
          end,
          kind: describeNode(node),
          children: (node.children ?? []).map(convert),
        }
    }
  }

  const template = descriptor.template?.ast
  const tree: VueTemplateNode = {
    type: 'VueTemplate',
    start: template?.loc.start.offset ?? 0,
    end: template?.loc.end.offset ?? 0,
    children:
      template?.type === ROOT ? (template.children ?? []).map(convert) : [],
  }

  // Expressions are pushed while converting, so the template comes last and
  // the contexts stay in source order among themselves.
  for (const expression of expressions) {
    contexts.push(expressionContext(expression.start, expression.end))
  }
  contexts.push({
    program: tree,
    module: { staticImports: setupImports },
    comments,
    errors: [],
  })

  // Injected statements go into `<script setup>`, whose bindings the template
  // sees; a component with only a plain `<script>` has no template macros
  // (the template cannot see its imports), so that block serves.
  const setupBlock = scripts.find((block) => block.setup)
  const target = setupBlock ?? scripts[0]
  return {
    contexts,
    insertion: target?.contentStart ?? 0,
    scripts,
    expressions,
    hasSetup: target !== undefined,
    lang: scripts.find((block) => block.lang !== undefined)?.lang,
  }
}

/** What a template node is, in the words of the error that rejects it. */
function describeNode(node: RawNode): string {
  switch (node.type) {
    case 9:
      return 'v-if'
    case 11:
      return 'v-for'
    case 12:
      return 'text call'
    default:
      return `node type ${node.type}`
  }
}
