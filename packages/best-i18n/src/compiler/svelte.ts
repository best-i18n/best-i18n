import { createRequire } from 'node:module'
import { parseSync } from 'oxc-parser'
import type { AST } from 'svelte/compiler'
import type { StaticImport } from './bindings.ts'

export interface ParsedSource {
  program: unknown
  module: { staticImports: StaticImport[] }
  comments: Array<{ value: string; end: number }>
  errors: Array<{ message: string }>
}

const require = createRequire(import.meta.url)

/** Keep Svelte optional for applications that only compile JS/TS. */
export function parseSvelte(
  code: string,
  filename: string,
): {
  contexts: ParsedSource[]
  insertion: number
} {
  let parser: typeof import('svelte/compiler')
  try {
    parser = require('svelte/compiler')
  } catch (cause) {
    throw new Error(
      'best-i18n: install svelte@^5 to translate .svelte files.',
      { cause },
    )
  }
  const ast = parser.parse(code, { filename, modern: true })
  const insertionScript = ast.module ?? ast.instance
  const parseScript = (script: AST.Script): ParsedSource => {
    const { start, end } = script.content as typeof script.content & {
      start: number
      end: number
    }
    // Preserve UTF-16 offsets and newlines so diagnostics, edits and PO
    // references point into the original component, including non-ASCII text.
    const padded =
      code.slice(0, start).replace(/[^\r\n]/g, ' ') + code.slice(start, end)
    const parsed = parseSync(`${filename}.ts`, padded, {
      lang: 'ts',
      sourceType: 'module',
    })
    return {
      program: parsed.program,
      module: { staticImports: parsed.module.staticImports as StaticImport[] },
      comments: parsed.comments,
      errors: parsed.errors,
    }
  }
  const module = ast.module ? parseScript(ast.module) : undefined
  const instance = ast.instance ? parseScript(ast.instance) : undefined
  const instanceImports = instance?.module.staticImports ?? []
  const instanceNames = new Set(
    instanceImports.flatMap((item) =>
      item.entries.map((entry) => entry.localName.value),
    ),
  )
  const inheritedImports = (module?.module.staticImports ?? []).map((item) => ({
    ...item,
    entries: item.entries.filter(
      (entry) => !instanceNames.has(entry.localName.value),
    ),
  }))
  // Svelte stores some binding/reference names as strings rather than ESTree
  // identifiers. Expose them to the shared macro misuse guard as well.
  const references: Array<{ type: string; name: string; start: number }> = []
  const templateComments: Array<{ value: string; end: number }> = []
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const node = value as Record<string, unknown>
    const type = node.type
    if (type === 'Comment')
      templateComments.push({
        value: node.data as string,
        end: node.end as number,
      })
    const name =
      type === 'EachBlock'
        ? node.index
        : [
              'Component',
              'UseDirective',
              'TransitionDirective',
              'AnimateDirective',
            ].includes(type as string) ||
            (type === 'LetDirective' && node.expression == null)
          ? node.name
          : undefined
    if (typeof name === 'string')
      references.push({
        type: 'Identifier',
        name: name.split('.')[0]!,
        start: node.start as number,
      })
    Object.values(node).forEach(visit)
  }
  visit(ast.fragment)
  const contexts: ParsedSource[] = []
  if (module) contexts.push(module)
  contexts.push({
    program: {
      type: 'SvelteInstance',
      script: instance?.program,
      fragment: ast.fragment,
      references,
    },
    module: { staticImports: [...inheritedImports, ...instanceImports] },
    comments: [
      ...(ast.comments ?? instance?.comments ?? []),
      ...templateComments,
    ],
    errors: instance?.errors ?? [],
  })
  return {
    contexts,
    insertion:
      (insertionScript?.content as { start?: number } | undefined)?.start ?? 0,
  }
}
