import adapter from '@sveltejs/adapter-node'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
    // Absolute `/_app/...` URLs: a relative base breaks client navigation
    // between `/zh` and `/zh/about`, which live at different depths.
    paths: { relative: false },
  },
  compilerOptions: {
    // Reactive locale reads go through best-i18n/svelte, which needs runes.
    runes: true,
  },
}

export default config
