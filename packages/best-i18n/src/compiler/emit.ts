import { catalogKey } from './message.ts'
import { GERMANIC } from './plural.ts'
import {
  renderTemplate,
  renderTrans,
  validatePluralForm,
  validateTemplateTranslation,
} from './trans.ts'
import type { FrameworkAdapter } from './adapter.ts'
import type { Message, TransformOptions, TransformResult } from './message.ts'
import type { TransElement } from './trans.ts'

/**
 * The emission half of the compiler: what each message becomes in the
 * output, and what has to be declared at the top of the module for it -
 * imports, shared functions, generated components, hoisted render props.
 * It never touches the file; `transform()` splices what it returns.
 */

const TOKEN_PATTERN = /(?<!\$)\{([A-Za-z0-9_$]+)\}/g

/** A message's replacement, and whether it is a JSX element already. */
export interface Emitted {
  replacement: string
  /**
   * A JSX element needs no braces among children - it is already an element
   * rather than a value to be interpolated.
   */
  isElement: boolean
}

export interface Emitter {
  /** Compiles one call site. */
  compile: (message: Message) => Emitted
  /**
   * `useLocale()` under the module's name for it, for rewriting a
   * `useI18n()` call; marks the React import as needed.
   */
  reactLocaleRead: () => string
  /**
   * Every statement the compiled call sites rely on, in the order they have
   * to appear: imports first, then hoisted declarations.
   */
  prologue: () => string[]
  missing: TransformResult['missing']
  clientUnbound: TransformResult['clientUnbound']
}

export function createEmitter(input: {
  code: string
  filename: string
  options: TransformOptions
  adapter: FrameworkAdapter
  messages: Message[]
  /** See `Analysis.reusableLocaleRead`. */
  reusableLocaleRead: string | undefined
  runtimeModule: string
  reactModule: string
  isClientModule: boolean
}): Emitter {
  const {
    code,
    filename,
    options,
    adapter,
    messages,
    reusableLocaleRead,
    runtimeModule,
    reactModule,
    isClientModule,
  } = input
  const missing: TransformResult['missing'] = []
  let needsRuntime = false
  let needsReact = false

  // Never inject a bare name: the file may already import or define one
  // (a locale switcher does), which is a duplicate-declaration parse error.
  const hygienic = (base: string): string => {
    let name = base
    for (let suffix = 2; code.includes(name); suffix++) {
      name = `${base}${suffix}`
    }
    return name
  }
  const localGetLocale = hygienic('__i18nGetLocale')
  // The module may already import the very function the compiled reads need.
  // Borrowing that name leaves one import where there would have been two -
  // and the second one would have gone unused in the process, since the call
  // it was written for gets aliased away.
  const localUseLocale = reusableLocaleRead ?? hygienic('__i18nUseLocale')
  const localN = hygienic('__i18nN')
  const localI = hygienic('__i18nI')

  const ruleFor = (locale: string) => options.plurals?.[locale] ?? GERMANIC

  const others = options.locales.filter(
    (locale) => locale !== options.baseLocale,
  )

  /**
   * What a shared function has to agree on, which is more than a catalog key:
   * the parameter list. A shared msgid implies a shared placeholder and element
   * set, so this is the same string for every call site in practice - it is
   * here so that a disagreement produces a second function rather than a call
   * with the wrong arity.
   */
  const signatureOf = (message: Message): string =>
    [
      catalogKey(message.context, message.text, message.plural?.other),
      message.placeholders.join(','),
      // `t` and `<Trans>` do not compile the same message the same way - a
      // lone expression stays an expression under `<Trans>` and stringifies
      // under `t` - so they never share a function, markup or no markup.
      message.elements === undefined
        ? 't'
        : `jsx:${message.elements.map((element) => element.token).join(',')}`,
    ].join('|')

  // How many call sites share a message. A message repeated within one module
  // hoists into a single module-level function - the translations are emitted
  // once, each call site pays one call. Only the multi-locale ternary form is
  // worth it: under `staticLocale` (and a single-locale config) the message is
  // already a bare literal.
  const repeats = new Map<string, number>()
  if (options.staticLocale === undefined && others.length > 0) {
    for (const message of messages) {
      // A literal locale folds to one locale's text and calls nothing.
      if (message.explicitLocale?.literal !== undefined) continue
      const key = signatureOf(message)
      repeats.set(key, (repeats.get(key) ?? 0) + 1)
    }
  }
  const hoistPrefix = hygienic('__i18nM')
  const hoistedNames = new Map<string, string>()
  const hoistedDecls: string[] = []
  const componentPrefix = hygienic('__i18nT')
  const componentNames = new Map<string, string>()
  const componentDecls: string[] = []
  const elementPrefix = hygienic('__i18nC')
  const elementNames = new Map<string, string>()
  const elementDecls: string[] = []
  const localChild = hygienic('__i18nChild')
  const localProps = hygienic('__i18nProps')
  const clientUnbound: TransformResult['clientUnbound'] = []

  // Compiles one message to its replacement expression. `localeExpr` is what
  // the ternary compares: the hook variable, a `getLocale()` call, or a
  // hoisted function's own locale parameter. `refs`, where given, names the
  // render prop standing in for each of a `<Trans>`'s elements, so the message
  // can be compiled away from the call site the elements came from.
  const compileMessage = (
    message: Message,
    localeExpr: string,
    refs?: string[],
    /** A locale named at the call site: render it and nothing else. */
    fixedLocale?: string,
  ): string => {
    const describe = (locale: string) =>
      `${filename}:${message.line} (${locale}) "${message.text}"`

    const entry =
      options.catalog[
        catalogKey(message.context, message.text, message.plural?.other)
      ]

    // What a locale renders when it has no (valid) translation: the source.
    const sourceValue: string | string[] =
      message.plural === undefined
        ? message.text
        : [message.text, message.plural.other]

    const valueFor = (locale: string): string | string[] => {
      const value = entry?.[locale]

      const valid =
        message.plural === undefined
          ? typeof value === 'string'
          : Array.isArray(value) &&
            value.length === ruleFor(locale).nplurals &&
            value.every((form) => form !== '')

      if (!valid) {
        if (locale !== options.baseLocale) {
          missing.push({ text: message.text, locale })
        }
        return sourceValue
      }

      return value as string | string[]
    }

    // Tokens a plural form may use: every placeholder, plus any literal
    // `{...}` the source forms themselves carry.
    const allowedTokens = new Set(message.placeholders)
    if (message.plural !== undefined) {
      const combined = `${message.text}\u0000${message.plural.other}`
      for (const match of combined.matchAll(TOKEN_PATTERN)) {
        allowedTokens.add(match[1]!)
      }
    }

    // `<Trans>` rebuilds markup; `t` produces a template literal; `plural`
    // produces a per-locale form dispatch. All three validate the
    // translation's placeholders against the source first: a dropped or
    // invented `{name}` must fail here, named, not ship silently.
    const render = (value: string | string[], locale: string): string => {
      if (message.plural !== undefined) {
        const forms = Array.isArray(value) ? value : [value]
        for (const form of forms) {
          validatePluralForm(form, allowedTokens, describe(locale))
        }

        const rendered = forms.map((form) =>
          renderTemplate(form, message.expressions, message.placeholders),
        )
        if (rendered.length === 1) return rendered[0]!

        // The locale's gettext formula, inlined. `+()` because a two-form
        // formula like `n != 1` evaluates to a boolean, which is an index in
        // C but not under `===` in JavaScript.
        const formula = ruleFor(locale).formula.replace(/\bn\b/g, localN)
        const branches = rendered
          .slice(1)
          .map((form, index) => `${localI} === ${index + 1} ? ${form} : `)
          .join('')

        return (
          `((${localN}, ${localI} = +(${formula})) => ` +
          `${branches}${rendered[0]!})(${message.plural.count})`
        )
      }

      const text = value as string
      if (message.elements === undefined) {
        validateTemplateTranslation(text, message.text, describe(locale))
        return renderTemplate(text, message.expressions, message.placeholders)
      }
      return renderTrans(
        text,
        message.expressions,
        message.placeholders,
        message.elements,
        describe(locale),
        refs,
        adapter.transFragment,
        adapter.interpolate,
      )
    }

    if (fixedLocale !== undefined) {
      return render(valueFor(fixedLocale), fixedLocale)
    }

    // A call site that names its locale keeps its branches in a per-locale
    // build: the build fixes the current locale, not the ones asked for.
    if (
      options.staticLocale !== undefined &&
      message.explicitLocale === undefined
    ) {
      return render(valueFor(options.staticLocale), options.staticLocale)
    }

    const base = render(valueFor(options.baseLocale), options.baseLocale)
    if (others.length === 0) return base

    // Markup may not be expressible as a ternary of fragments - Svelte puts
    // an `{#if}` in the template instead - so the adapter gets the branches.
    if (
      adapter.renderMarkupBranches !== undefined &&
      (message.elements?.length ?? 0) > 0
    ) {
      return adapter.renderMarkupBranches(
        message,
        base,
        others.map((locale) => ({
          locale,
          rendered: render(valueFor(locale), locale),
        })),
        localeExpr,
      )
    }

    // A ternary chain, not an object literal and not an IIFE: nothing is
    // allocated per render.
    const branches = others
      .map(
        (locale) =>
          `${localeExpr} === ${JSON.stringify(locale)} ? ${render(
            valueFor(locale),
            locale,
          )} : `,
      )
      .join('')

    return `(${branches}${base})`
  }

  /** What a report says about a message: enough to find it again. */
  const pointAt = (message: Message) => ({
    text: message.text,
    line: message.line,
  })

  /** One parameter per expression, then one per element. */
  const paramsFor = (message: Message) => ({
    expressions: message.expressions.map((_, index) => `e${index}`),
    elements: (message.elements ?? []).map((_, index) => `c${index}`),
  })

  /**
   * The `(l, e0, ..., c0, ...) => <ternary>` every call site of a message can
   * share: the translations are emitted once and validated once, and each call
   * site pays a call.
   *
   * The inline form splices call-site source into the template - expressions
   * into the text, a `<a href={url}>`'s attributes into the markup - and that
   * cannot leave the scope it came from. Parameters are how it leaves:
   * expressions arrive as values, elements as render props.
   */
  const sharedFunction = (message: Message): string => {
    const key = signatureOf(message)
    const existing = hoistedNames.get(key)
    if (existing !== undefined) return existing

    const name = `${hoistPrefix}${hoistedNames.size + 1}`
    hoistedNames.set(key, name)

    const params = paramsFor(message)
    const lifted: Message = {
      ...message,
      expressions: params.expressions,
      plural:
        message.plural === undefined
          ? undefined
          : {
              ...message.plural,
              count:
                params.expressions[
                  message.expressions.indexOf(message.plural.count)
                ]!,
            },
    }
    hoistedDecls.push(
      `const ${name} = (${['l', ...params.expressions, ...params.elements].join(
        ', ',
      )}) => ${compileMessage(lifted, 'l', params.elements)}`,
    )

    return name
  }

  /**
   * A generated component for one message, so a client module can read the
   * locale through React without the file having called `useI18n()`.
   *
   * The hook has to sit at the top of a component's own render, and a message
   * among someone else's JSX is not that - so the message becomes the
   * component. Nothing about the markup is deferred to runtime: the body is
   * the same locale ternary as everywhere else, one level down.
   */
  const generatedComponent = (message: Message): string => {
    const key = signatureOf(message)
    const existing = componentNames.get(key)
    if (existing !== undefined) return existing

    const name = `${componentPrefix}${componentNames.size + 1}`
    componentNames.set(key, name)

    const params = paramsFor(message)
    const all = [...params.expressions, ...params.elements]
    const args = [
      `${localUseLocale}()`,
      ...all.map((p) => `${localProps}.${p}`),
    ]
    componentDecls.push(
      `const ${name} = (${all.length === 0 ? '' : localProps}) => ` +
        `${sharedFunction(message)}(${args.join(', ')})`,
    )
    needsReact = true

    return name
  }

  /**
   * The render prop for one element: `(child) => <a href={url}>{child}</a>`.
   *
   * An element whose source names nothing from the call site - a plain `<b>`,
   * an `<a href="/docs">` - is the same function for every render, so it is
   * hoisted to module scope and allocated once. The tag has to be intrinsic
   * for that: an uppercase one could be a component declared inside the
   * function we are hoisting out of.
   */
  const elementProp = (element: TransElement): string => {
    const source = element.selfClosing
      ? `() => ${element.open}`
      : `(${localChild}) => ${element.open}{${localChild}}${element.close}`

    if (element.open.includes('{') || !/^<[a-z]/.test(element.open)) {
      return source
    }

    const existing = elementNames.get(source)
    if (existing !== undefined) return existing

    const name = `${elementPrefix}${elementNames.size + 1}`
    elementNames.set(source, name)
    elementDecls.push(`const ${name} = ${source}`)

    return name
  }

  const compile = (message: Message): Emitted => {
    const key = signatureOf(message)
    let replacement: string
    // A JSX element needs no braces among children - it is already an element
    // rather than a value to be interpolated.
    let isElement = false

    // A locale named at the call site - `t.locale(lang)`, `<Trans locale>` -
    // is not the current one: nothing to subscribe to, nothing to bind, and
    // a literal compiles to that locale's text alone.
    const explicit = message.explicitLocale
    if (explicit?.literal !== undefined) {
      if (!options.locales.includes(explicit.literal)) {
        throw new Error(
          `best-i18n: ${filename}:${message.line} names locale ` +
            `${JSON.stringify(explicit.literal)}, which is not one of ` +
            `${options.locales.join(', ')}.`,
        )
      }
    }
    const localeRead =
      explicit?.source ?? message.localeVar ?? `${localGetLocale}()`

    // Nothing to bind when the locale cannot vary: a per-locale build and a
    // single-locale config both compile to a bare literal.
    const unbound =
      explicit === undefined &&
      message.localeVar === undefined &&
      options.staticLocale === undefined &&
      others.length > 0

    if (explicit?.literal !== undefined) {
      replacement = compileMessage(
        message,
        localeRead,
        undefined,
        explicit.literal,
      )
    } else if (unbound && isClientModule && message.elementOk === true) {
      const params = paramsFor(message)
      const attributes = [
        ...params.expressions.map(
          (param, index) => `${param}={${message.expressions[index]}}`,
        ),
        ...params.elements.map(
          (param, index) =>
            `${param}={${elementProp(message.elements![index]!)}}`,
        ),
      ]
      const name = generatedComponent(message)
      replacement = `<${name}${attributes.map((a) => ` ${a}`).join('')} />`
      isElement = true
    } else if ((repeats.get(key) ?? 0) >= 2 && adapter.hoistable(message)) {
      // Hook-bound call sites pass the variable that already holds the
      // locale; others read it at call time, so one function serves both.
      const args = [
        localeRead,
        ...message.expressions,
        ...(message.elements ?? []).map(elementProp),
      ]
      if (unbound) {
        needsRuntime = true
        if (isClientModule) clientUnbound.push(pointAt(message))
      }
      replacement = `${sharedFunction(message)}(${args.join(', ')})`
    } else {
      replacement = compileMessage(message, localeRead)
      if (unbound) {
        needsRuntime = true
        if (isClientModule) clientUnbound.push(pointAt(message))
      }
    }

    if (adapter.wrapReplacement !== undefined) {
      replacement = adapter.wrapReplacement(message, replacement, {
        staticLocale: options.staticLocale !== undefined,
      })
    }

    return { replacement, isElement }
  }

  const prologue = (): string[] => {
    const statements: string[] = []
    if (needsRuntime) {
      statements.push(
        `import { getLocale as ${localGetLocale} } from ${JSON.stringify(
          runtimeModule,
        )}`,
      )
    }
    if (needsReact && reusableLocaleRead === undefined) {
      statements.push(
        `import { useLocale as ${localUseLocale} } from ${JSON.stringify(
          reactModule,
        )}`,
      )
    }
    return [...statements, ...elementDecls, ...hoistedDecls, ...componentDecls]
  }

  return {
    compile,
    reactLocaleRead: () => {
      needsReact = true
      return `${localUseLocale}()`
    },
    prologue,
    missing,
    clientUnbound,
  }
}
