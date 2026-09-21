import type { Composer } from 'vue-i18n'

// Nuxt's template types use @vue/runtime-core; vue-i18n's augmentation of
// `vue` does not reach them with the current dependency versions.
declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $t: Composer['t']
  }
}
