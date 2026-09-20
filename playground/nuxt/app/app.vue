<script setup lang="ts">
import { localizePathname } from 'best-i18n/locale-url'
import { t } from 'best-i18n/macro'
import { getLocale } from 'best-i18n/vue'
import { useRuntimeConfig } from 'nuxt/app'
import type { UrlConfig } from 'best-i18n/locale-url'

const config = useRuntimeConfig().public.bestI18n as UrlConfig
/** `/about` while Chinese is active becomes `/zh/about`. */
const href = (path: string) => localizePathname(path, getLocale(), config)
</script>

<template>
  <header>
    <nav>
      <NuxtLink :to="href('/')">{{ t`Home` }}</NuxtLink>
      <NuxtLink :to="href('/about')">{{ t`About` }}</NuxtLink>
    </nav>
    <LocaleSwitcher />
  </header>
  <main>
    <NuxtPage />
  </main>
</template>
