<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ name: string; count: number }>()
const title = computed(() => `你好`)
</script>

<template>
  <h1 :title="`说“嗨”`">{{ title }}</h1>
  <!-- i18n: greets the signed-in user -->
  <p>{{ `你好 ${props.name}` }}</p>
  <p>{{ ((__i18nN, __i18nI = +(__i18nN != 1)) => __i18nI === 1 ? `${props.count} items` : `One item`)(props.count) }}</p>
  <p>
    {{ `阅读` }}<a href="/docs">{{ `文档` }}</a>{{ `了解` }}<b>{{ `更多` }}</b>{{ `。` }}
  </p>
  <p>{{ `打开` }}</p>
  <p>{{ `第一行` }}<br />{{ `第二行` }}</p>
  <button @click="log(`你好`)">{{ `你好` }}</button>
</template>
