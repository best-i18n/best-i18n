import { oxlint } from '@debbl/oxc-config'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [oxlint({ react: true, a11y: true })],
  ignorePatterns: [
    // Written by the TanStack Router plugin and the Paraglide compiler on
    // every dev and build.
    '**/routeTree.gen.ts',
    '**/src/paraglide/**',
    '**/project.inlang/**',
    // Next.js rewrites this on every build.
    '**/next-env.d.ts',
    // Compiler test fixtures: inputs are standalone snippets and outputs are
    // emitted code, written by `vitest run -u` - not ours to lint.
    '**/test/fixtures/**',
  ],
  rules: {
    // Every `.sort()` here runs on an array the same expression just built -
    // `[...entry.references].sort()`, `entries.map(key).sort()` - so there is
    // no original to protect and `toSorted()` would only add a copy.
    'unicorn/no-array-sort': 'off',
    // Helpers that capture nothing are still colocated with their one caller
    // on purpose; hoisting them just moves them away from what they explain.
    'unicorn/consistent-function-scoping': 'off',
  },
  overrides: [
    {
      // The Next.js rules only mean anything where Next actually runs. Left
      // global, `next/no-head-element` flags the plain `<head>` that TanStack
      // Start's root route is supposed to render.
      files: [
        'apps/website/**',
        'playground/nextjs/**',
        'playground/nextjs-intl/**',
      ],
      plugins: ['nextjs'],
      rules: {
        'react/only-export-components': oxlint({ next: true }).rules![
          'react/only-export-components'
        ],
      },
    },
    {
      files: ['apps/website/src/app/**/*.with.tsx'],
      rules: {
        // These modules pair translated server components with their metadata
        // and static-params helpers.
        'react/only-export-components': [
          'warn',
          {
            allowExportNames: [
              'withGenerateMetadata',
              'withGenerateStaticParams',
            ],
          },
        ],
      },
    },
    {
      files: ['playground/nextjs-intl/**'],
      rules: {
        // The arrows passed to `t.rich` are next-intl's markup API - tag
        // handlers, not component definitions.
        'react/no-unstable-nested-components': 'off',
      },
    },
    {
      files: ['**/test/**'],
      rules: {
        // Tests read a hook's return value by assigning it to an outer
        // variable from a probe component. That is the point of the probe.
        'react/globals': 'off',
        // Tests embed source snippets and expected compiled output; `${name}`
        // in a regular string is the catalog/source text, not a missed template.
        'no-template-curly-in-string': 'off',
      },
    },
  ],
})
