import { defineConfig } from 'tsdown'

// Named entries rather than a file list: the source is laid out by concern
// (compiler, runtime, integrations) while the published subpaths stay flat, so
// moving a file never renames a public entry point.
export default defineConfig({
  entry: {
    'macro': 'src/macro.ts',
    'react': 'src/frameworks/react/index.ts',
    'react-macro': 'src/frameworks/react/macro.ts',
    'solid': 'src/frameworks/solid/index.ts',
    'solid-macro': 'src/frameworks/solid/macro.ts',
    'svelte': 'src/frameworks/svelte/index.ts',
    'svelte-macro': 'src/frameworks/svelte/macro.ts',
    'vue': 'src/frameworks/vue/index.ts',
    'vue-macro': 'src/frameworks/vue/macro.ts',
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
    'nuxt': 'src/integrations/nuxt/index.ts',
    'nuxt-plugin': 'src/integrations/nuxt/plugin.ts',
    'nuxt-server-plugin': 'src/integrations/nuxt/server-plugin.ts',
    'transform': 'src/compiler/transform.ts',
    'po': 'src/compiler/po.ts',
    'cli-extract': 'src/cli/extract.ts',
    'cli-compile': 'src/cli/compile.ts',
  },
  // Next.js has no `exports` map, so the bundler happily resolves `next/link`
  // to `next/link.js` on disk - and Next's own compiler keys its client/server
  // boundaries off the specifier as written. Keep them verbatim.
  deps: {
    // The same goes for Nuxt and Nitro: their runtime is resolved by the app's
    // build, not ours, and `nuxt/app` in particular must stay a specifier.
    neverBundle: [
      /^next(\/|$)/,
      /^nuxt(\/|$)/,
      /^@nuxt\//,
      /^nitropack(\/|$)/,
      /^h3$/,
    ],
  },
  sourcemap: true,
  dts: { sourcemap: true },
})
