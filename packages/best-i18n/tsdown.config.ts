import { defineConfig } from 'tsdown'

// Named entries rather than a file list: the source is laid out by concern
// (compiler, runtime, integrations) while the published subpaths stay flat, so
// moving a file never renames a public entry point.
export default defineConfig({
  entry: {
    'macro': 'src/macro.ts',
    'react': 'src/react/index.ts',
    'react-macro': 'src/react/macro.ts',
    'runtime': 'src/runtime/index.ts',
    'server': 'src/runtime/server.ts',
    'client': 'src/client.ts',
    'request': 'src/request.ts',
    'locale-url': 'src/locale-url.ts',
    'vite': 'src/integrations/vite.ts',
    'rolldown': 'src/integrations/rolldown.ts',
    'next': 'src/integrations/next/index.ts',
    'next-config': 'src/integrations/next/config.ts',
    'next-loader': 'src/integrations/next/loader.ts',
    'next-navigation': 'src/integrations/next/navigation.ts',
    'next-proxy': 'src/integrations/next/proxy.ts',
    'next-server': 'src/integrations/next/server.ts',
    'transform': 'src/compiler/transform.ts',
    'po': 'src/compiler/po.ts',
    'cli-extract': 'src/cli/extract.ts',
    'cli-compile': 'src/cli/compile.ts',
  },
  // Next.js has no `exports` map, so the bundler happily resolves `next/link`
  // to `next/link.js` on disk - and Next's own compiler keys its client/server
  // boundaries off the specifier as written. Keep them verbatim.
  external: [/^next(\/|$)/],
  sourcemap: true,
  dts: { sourcemap: true },
})
