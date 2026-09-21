import { parseJsx } from '../../compiler/jsx.ts'
import {
  REACT_MACRO_MODULE,
  VUE_MACRO_MODULE,
  VUE_MODULE,
} from '../../compiler/modules.ts'
import { tokenForElement, tokenForExpression } from '../../compiler/trans.ts'
import { parseVue } from './parse.ts'
import type { MagicString } from 'magic-string'
import type {
  FrameworkAdapter,
  ParsedFile,
  TransContext,
  TransMatch,
} from '../../compiler/adapter.ts'
import type { ExplicitLocale, Message } from '../../compiler/message.ts'
import type { TransElement, TransMessage } from '../../compiler/trans.ts'
import type { VueExpression, VueScript, VueTemplateNode } from './parse.ts'

interface VueParsedFile extends ParsedFile {
  scripts: VueScript[]
  expressions: VueExpression[]
  hasSetup: boolean
  lang: string | undefined
}

/** Elements that are template plumbing, not something a sentence contains. */
const NOT_IN_A_SENTENCE = new Set(['template', 'slot', 'component'])

/**
 * Same stored message as the JSX serializer, from a Vue template: `{{ name }}`
 * is an interpolation, `<a>` an element. Vue has already condensed the
 * whitespace and decoded the entities, so the text is what renders.
 */
export function serializeVueTrans(
  children: readonly VueTemplateNode[],
  code: string,
  filename: string,
): TransMessage {
  const expressions: string[] = []
  const placeholders: string[] = []
  const elements: TransElement[] = []

  const text = serializeVueChildren(
    children,
    code,
    filename,
    expressions,
    placeholders,
    elements,
  )

  // The sentence's own edges: whatever indentation survived condensing.
  return { text: text.trim(), expressions, placeholders, elements }
}

function serializeVueChildren(
  children: readonly VueTemplateNode[],
  code: string,
  filename: string,
  expressions: string[],
  placeholders: string[],
  elements: TransElement[],
): string {
  let out = ''

  for (const child of children) {
    switch (child.type) {
      case 'VueText':
        out += child.text ?? ''
        break

      case 'VueComment':
        break

      case 'VueInterpolation': {
        const source = child.expression!.source
        out += `{${tokenForExpression(source, expressions, placeholders)}}`
        break
      }

      case 'VueElement': {
        if (NOT_IN_A_SENTENCE.has(child.tag!)) {
          throw new Error(
            `best-i18n: <Trans> in ${filename} contains a <${child.tag}>, ` +
              'which has no place in a message. Move it outside the <Trans>.',
          )
        }
        const nodes = child.children ?? []
        const token = tokenForElement(
          child.tag,
          elements.map((element) => element.token),
        )
        const index = elements.length
        elements.push({ token, open: '', close: '', selfClosing: false })

        const selfClosing = nodes.length === 0
        elements[index] = {
          token,
          open: selfClosing
            ? code.slice(child.start, child.end)
            : code.slice(child.start, nodes[0]!.start),
          close: selfClosing
            ? ''
            : code.slice(nodes[nodes.length - 1]!.end, child.end),
          selfClosing,
        }

        const inner = selfClosing
          ? ''
          : serializeVueChildren(
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
          `best-i18n: <Trans> in ${filename} contains a ${child.kind ?? child.type} ` +
            'child, which has no place in a message. Move it outside the <Trans>.',
        )
    }
  }

  return out
}

/** A `<Trans>...</Trans>` component in a Vue template, read into a message. */
function matchVueTrans(
  node: Record<string, unknown>,
  _parent: Record<string, unknown> | undefined,
  { code, filename, component, componentLocals }: TransContext,
): TransMatch | undefined {
  if (node.type !== 'VueElement') return undefined
  const element = node as unknown as VueTemplateNode
  if (!componentLocals.has(element.tag!)) return undefined

  const { start } = element
  let context = ''
  let explicitLocale: ExplicitLocale | undefined
  for (const prop of element.props ?? []) {
    if (prop.kind === 'attribute' && prop.name === 'locale') {
      if (prop.value === undefined || prop.value === '') {
        throw new Error(
          `best-i18n: <${component} locale> needs a value ` +
            `(${filename} offset ${start}).`,
        )
      }
      explicitLocale = {
        source: JSON.stringify(prop.value),
        literal: prop.value,
      }
      continue
    }
    if (
      prop.kind === 'directive' &&
      prop.name === 'bind' &&
      prop.arg === 'locale' &&
      prop.expression !== undefined
    ) {
      const source = prop.expression
      const quoted = /^(['"])(.*)\1$/.exec(source)
      explicitLocale =
        quoted === null ? { source } : { source, literal: quoted[2]! }
      continue
    }
    if (prop.kind === 'attribute' && prop.name === 'ctx') {
      if (prop.value === undefined || prop.value === '') {
        throw new Error(
          `best-i18n: <${component} ctx> must be a non-empty string ` +
            `literal (${filename} offset ${start}).`,
        )
      }
      context = prop.value
      continue
    }
    throw new Error(
      `best-i18n: <${component}> takes no props other than ctx ` +
        `(${filename} offset ${start}). Wrap it in an element if you ` +
        'need one.',
    )
  }

  const { text, expressions, placeholders, elements } = serializeVueTrans(
    element.children ?? [],
    code,
    filename,
  )
  // Self-closing, or nothing but whitespace and comments once Vue has
  // condensed it: either way there is no message.
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
    end: element.end,
    // The replacement is template syntax either way: `{{ }}` around a
    // text-only message is added by `wrapReplacement`, markup becomes
    // `<template v-if>` blocks. Neither wants the core's `{...}`.
    braced: false,
    elementOk: false,
    vue: true,
    ...(explicitLocale === undefined ? {} : { explicitLocale }),
  }
}

/**
 * Vue 3: a single-file component is up to two `<script>` blocks and a
 * template whose expressions are JavaScript in disguise. `<Trans>` is an
 * element with a component tag, `{{ }}` is how a value reaches the template,
 * and markup cannot live inside `{{ }}` - so a message with markup becomes
 * `<template v-if>` blocks. The locale is read through `best-i18n/vue`,
 * which is a ref and therefore tracked by the render.
 */
export const vue: FrameworkAdapter<VueParsedFile> = {
  name: 'vue',
  runtimeModule: VUE_MODULE,
  componentModule: VUE_MACRO_MODULE,
  clientDirectives: false,
  transFragment: false,
  interpolate: (expression) => `{{ ${expression} }}`,

  parse(code, filename) {
    const cleanName = filename.split('?')[0] ?? filename
    // A composable or a store is ordinary TypeScript; only its locale read
    // is Vue's.
    if (!cleanName.endsWith('.vue')) {
      return {
        ...parseJsx(code, filename),
        scripts: [],
        expressions: [],
        hasSetup: true,
        lang: undefined,
      }
    }
    const parsed = parseVue(code, filename)
    return {
      contexts: parsed.contexts,
      directiveEnd: parsed.insertion,
      directives: [],
      scripts: parsed.scripts,
      expressions: parsed.expressions,
      hasSetup: parsed.hasSetup,
      lang: parsed.lang,
    }
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
          'best-i18n: Vue supports t, plural, and <Trans> from ' +
            `${VUE_MACRO_MODULE}; React macros are not supported.`,
        )
      }
    }
  },

  matchTrans: matchVueTrans,

  // A `<template v-if>` block is template syntax, not an expression: it
  // cannot be the body of a shared function. Text-only messages can.
  hoistable: (message: Message) =>
    !(message.vue === true && (message.elements?.length ?? 0) > 0),

  // Markup cannot live inside `{{ }}`, so each locale's version becomes a
  // `<template v-if>` block; the condition uses single quotes because it
  // sits inside a double-quoted attribute.
  renderMarkupBranches(_message, base, branches, localeExpr) {
    const chain = branches.map(
      ({ locale, rendered }, index) =>
        `<template ${index === 0 ? 'v-if' : 'v-else-if'}="${localeExpr} === '${locale}'">${rendered}</template>`,
    )
    return `${chain.join('')}<template v-else>${base}</template>`
  },

  // A text-only `<Trans>` compiles to an expression, and an expression
  // reaches a Vue template through `{{ }}`. Markup is already template.
  wrapReplacement(message, replacement) {
    if (message.vue === true && (message.elements?.length ?? 0) === 0) {
      return `{{ ${replacement} }}`
    }
    return replacement
  },

  finalize(source: MagicString, _code, parsed, injected, messages) {
    // Without a `<script setup>` the injected statements were prepended to
    // the file. Give them the block the template can see them from: setup
    // bindings, imports included, are what a template resolves against.
    if (injected && !parsed.hasSetup) {
      const lang = parsed.lang === undefined ? '' : ` lang="${parsed.lang}"`
      source.prepend(`<script setup${lang}>\n`)
      source.appendLeft(0, '</script>\n\n')
    }

    // A compiled expression carries quotes - `"zh"` in the ternary, `"` in a
    // translation - and an attribute value cannot. Re-quote as the entity
    // Vue decodes before it reads the expression.
    for (const { start, end, quote } of parsed.expressions) {
      if (quote === undefined) continue
      // An expression inside a replaced <Trans> - its `:locale` - is gone.
      // One that *is* a message, or holds one, is still there to re-quote.
      if (
        messages.some(
          (m) =>
            m.start <= start &&
            m.end >= end &&
            !(m.start === start && m.end === end),
        )
      ) {
        continue
      }
      const text = source.slice(start, end)
      if (!text.includes(quote)) continue
      source.overwrite(
        start,
        end,
        text.replaceAll(quote, quote === '"' ? '&quot;' : '&#39;'),
      )
    }
  },
}
