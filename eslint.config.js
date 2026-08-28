//  @ts-check
import { defineConfig } from '@debbl/eslint-config'

export default defineConfig(
  {
    typescript: true,
  },
  {
    // Written by the TanStack Router plugin on every dev and build.
    ignores: ['**/routeTree.gen.ts'],
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
