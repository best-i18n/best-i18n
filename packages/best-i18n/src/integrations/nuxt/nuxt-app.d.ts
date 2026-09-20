/**
 * The slice of `nuxt/app` the plugin uses. Nuxt resolves the real module in
 * the app's build; this only lets the package typecheck without depending on
 * `nuxt`, whose peer-resolved install cannot be linked into a library.
 */
declare module 'nuxt/app' {
  import type { H3Event } from 'h3'

  export function defineNuxtPlugin(plugin: {
    name?: string
    enforce?: 'pre' | 'default' | 'post'
    setup?: () => void | Promise<void>
  }): unknown
  export function useHead(input: {
    htmlAttrs?: Record<string, string | undefined>
  }): void
  export function useRequestEvent(): H3Event | undefined
  export function tryUseNuxtApp(): {
    ssrContext?: { event: H3Event }
  } | null
  export function useRuntimeConfig(): { public: Record<string, unknown> }
}
