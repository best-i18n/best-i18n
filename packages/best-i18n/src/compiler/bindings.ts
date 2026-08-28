export interface StaticImportEntry {
  importName: { kind: string; name?: string }
  localName: { value: string }
  isType: boolean
}

export interface StaticImport {
  moduleRequest: { value: string }
  entries: StaticImportEntry[]
}

export interface MacroBindings {
  /** Local names bound to the macro export in this module. */
  locals: Set<string>
  /** Namespace imports of a macro module, which we cannot resolve. */
  namespaces: string[]
}

/**
 * Resolves which local identifiers actually refer to the macro export.
 *
 * Matching on the identifier's name alone both misses aliases and silently
 * rewrites an unrelated `t` from some other library, so the binding is what
 * counts.
 */
export function resolveMacroBindings(options: {
  staticImports: StaticImport[]
  from: string[]
  exportName: string
}): MacroBindings {
  const { staticImports, from, exportName } = options
  const locals = new Set<string>()
  const namespaces: string[] = []

  for (const declaration of staticImports) {
    if (!from.includes(declaration.moduleRequest.value)) continue

    for (const entry of declaration.entries) {
      if (entry.isType) continue

      if (entry.importName.kind === 'NamespaceObject') {
        namespaces.push(entry.localName.value)
        continue
      }

      if (entry.importName.name === exportName) {
        locals.add(entry.localName.value)
      }
    }
  }

  return { locals, namespaces }
}

/**
 * Positions where an identifier is a name rather than a value reference, so a
 * property called `t` or an object key `t` is not mistaken for macro usage.
 */
export function isNonReferencePosition(
  parent: Record<string, unknown> | undefined,
  node: unknown,
): boolean {
  if (parent === undefined) return false

  switch (parent.type) {
    case 'MemberExpression':
    case 'JSXMemberExpression':
      return parent.property === node && parent.computed !== true
    case 'Property':
    case 'ObjectProperty':
      return parent.key === node && parent.computed !== true
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
    case 'ExportSpecifier':
      return true
    case 'PropertyDefinition':
    case 'MethodDefinition':
      return parent.key === node
    case 'LabeledStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
      return parent.label === node
    default:
      return false
  }
}
