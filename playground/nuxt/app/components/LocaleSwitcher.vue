<script setup lang="ts">
import { switchLocale } from 'best-i18n/client'
import { useLocale } from 'best-i18n/vue'
import { useRuntimeConfig } from 'nuxt/app'
import type { SwitchConfig } from 'best-i18n/client'

const config = useRuntimeConfig().public.bestI18n as SwitchConfig
const locale = useLocale()

const LABELS: Record<string, string> = {
  en: 'English',
  zh: '中文',
}
</script>

<template>
  <div>
    <button
      v-for="item in config.locales"
      :key="item"
      type="button"
      :aria-current="item === locale ? 'true' : undefined"
      :disabled="item === locale"
      @click="switchLocale(item, config)"
    >
      {{ LABELS[item] ?? item }}
    </button>
  </div>
</template>
