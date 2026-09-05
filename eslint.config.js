//  @ts-check
import { defineConfig } from '@debbl/eslint-config'

export default defineConfig(
  {
    typescript: true,
  },
  {
    // Written by the TanStack Router plugin and the Paraglide compiler on
    // every dev and build.
    ignores: [
      '**/routeTree.gen.ts',
      '**/src/paraglide/**',
      '**/project.inlang/**',
      // Next.js rewrites this on every build, so formatting it is undone.
      '**/next-env.d.ts',
      // Compiler test fixtures: inputs are standalone snippets and outputs
      // are emitted code, written by `vitest run -u` - not ours to format.
      '**/test/fixtures/**',
    ],
  },
  {
    // This package's whole job is emitting template literals, so string
    // literals containing `${` are the subject matter rather than a mistake.
    files: ['**/*.{ts,mjs}'],
    rules: {
      'no-template-curly-in-string': 'off',
    },
  },
)
