import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { parseSync } from 'oxc-parser'
import type { AST } from 'svelte/compiler'
import type { StaticImport } from './bindings.ts'

export interface ParsedSource {
  program: unknown
  module: { staticImports: StaticImport[] }
  comments: Array<{ value: string; end: number }>
  errors: Array<{ message: string }>
}

/** A `<script>` element of the component, with the range of its content. */
export interface SvelteScript {
  start: number
  end: number
  contentStart: number
  contentEnd: number
}

function isMissingCompiler(cause: unknown): cause is Error {
  return (
    cause instanceof Error &&
    (cause as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND' &&
    cause.message.startsWith("Cannot find module 'svelte/compiler'")
  )
}

/**
 * Finds the Svelte compiler the component will later be compiled with: the
 * one the component's own project resolves, then the working directory's,
 * and only then whatever sits next to this library. Resolving from here
 * alone would miss a `svelte` installed only in a sub-package of a monorepo
 * that hoisted best-i18n to its root.
 */
function resolveCompiler(filename: string): string {
  const bases = [
    ...new Set([
      path.resolve(filename),
      path.join(process.cwd(), '__best-i18n__.js'),
    ]),
    import.meta.url,
  ]
  let missing: Error | undefined
  for (const base of bases) {
    try {
      return createRequire(base).resolve('svelte/compiler')
    } catch (cause) {
      // Any other failure - a broken package, an exports map that refuses
      // the subpath - is the real diagnosis; do not paper over it.
      if (!isMissingCompiler(cause)) throw cause
      missing = cause
    }
  }
  throw new Error('best-i18n: install svelte@^5 to translate .svelte files.', {
    cause: missing,
  })
}

function collectPatternNames(pattern: unknown, names: Set<string>): void {
  if (pattern === null || typeof pattern !== 'object') return
  const node = pattern as Record<string, unknown>
  switch (node.type) {
    case 'Identifier':
      names.add(node.name as string)
      break
    case 'ObjectPattern':
      for (const property of (node.properties ?? []) as Array<
        Record<string, unknown>
      >) {
        collectPatternNames(
          property.type === 'RestElement' ? property.argument : property.value,
          names,
        )
      }
      break
    case 'ArrayPattern':
      for (const element of (node.elements ?? []) as unknown[]) {
        collectPatternNames(element, names)
      }
      break
    case 'AssignmentPattern':
      collectPatternNames(node.left, names)
      break
    case 'RestElement':
      collectPatternNames(node.argument, names)
      break
    default:
  }
}

/**
 * Names the instance script declares at its top level. The template resolves
 * an identifier here before it looks at `<script module>`, so any of these
 * hides a same-named macro imported there.
 */
function declaredNames(program: unknown): Set<string> {
  const names = new Set<string>()
  const body =
    (program as { body?: Array<Record<string, unknown>> } | undefined)?.body ??
    []
  for (const statement of body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration'
        ? (statement.declaration as Record<string, unknown> | null)
        : statement
    if (declaration === null) continue
    if (declaration.type === 'VariableDeclaration') {
      for (const item of (declaration.declarations ?? []) as Array<
        Record<string, unknown>
      >) {
        collectPatternNames(item.id, names)
      }
    } else if (
      declaration.type === 'FunctionDeclaration' ||
      declaration.type === 'ClassDeclaration'
    ) {
      const id = declaration.id as { name?: string } | null
      if (typeof id?.name === 'string') names.add(id.name)
    }
  }
  return names
}

/** Keep Svelte optional for applications that only compile JS/TS. */
export function parseSvelte(
  code: string,
  filename: string,
): {
  contexts: ParsedSource[]
  insertion: number
  scripts: SvelteScript[]
} {
  const compilerPath = resolveCompiler(filename)
  // Load outside the resolver's catch: failures inside an installed compiler
  // must retain their original diagnostics, including missing transitive
  // dependencies.
  const parser: typeof import('svelte/compiler') = createRequire(
    import.meta.url,
  )(compilerPath)
  const ast = parser.parse(code, { filename, modern: true })
  const insertionScript = ast.module ?? ast.instance
  const contentRange = (script: AST.Script) =>
    script.content as typeof script.content & { start: number; end: number }
  const parseScript = (script: AST.Script): ParsedSource => {
    const { start, end } = contentRange(script)
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
  // Whatever the instance script binds itself - an import, a `const`, a
  // function - shadows the module script's macro of the same name, so the
  // template's `t` is that binding and not the macro.
  const instanceNames = declaredNames(instance?.program)
  for (const item of instanceImports) {
    for (const entry of item.entries) instanceNames.add(entry.localName.value)
  }
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
  const scripts: SvelteScript[] = []
  for (const script of [ast.module, ast.instance]) {
    if (!script) continue
    const { start, end } = contentRange(script)
    scripts.push({
      start: script.start,
      end: script.end,
      contentStart: start,
      contentEnd: end,
    })
  }
  return {
    contexts,
    insertion: insertionScript ? contentRange(insertionScript).start : 0,
    scripts,
  }
}
