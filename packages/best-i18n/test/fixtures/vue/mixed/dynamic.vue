<script setup lang="ts">
import { getLocale as __i18nGetLocale } from "best-i18n/vue";
const __i18nM1 = (l) => (l === "zh" ? `你好` : `Hello`);
import { computed } from 'vue'

const props = defineProps<{ name: string; count: number }>()
const title = computed(() => __i18nM1(__i18nGetLocale()))
</script>

<template>
  <h1 :title="(__i18nGetLocale() === &quot;zh&quot; ? `说“嗨”` : `Say 'hi'`)">{{ title }}</h1>
  <!-- i18n: greets the signed-in user -->
  <p>{{ (__i18nGetLocale() === "zh" ? `你好 ${props.name}` : `Hi ${props.name}`) }}</p>
  <p>{{ (__i18nGetLocale() === "zh" ? ((__i18nN, __i18nI = +(__i18nN != 1)) => __i18nI === 1 ? `${props.count} items` : `One item`)(props.count) : ((__i18nN, __i18nI = +(__i18nN != 1)) => __i18nI === 1 ? `${props.count} items` : `One item`)(props.count)) }}</p>
  <p>
    <template v-if="__i18nGetLocale() === 'zh'">{{ `阅读` }}<a href="/docs">{{ `文档` }}</a>{{ `了解` }}<b>{{ `更多` }}</b>{{ `。` }}</template><template v-else>{{ `Read the ` }}<a href="/docs">{{ `docs` }}</a>{{ ` to learn ` }}<b>{{ `more` }}</b>{{ `.` }}</template>
  </p>
  <p>{{ (__i18nGetLocale() === "zh" ? `打开` : `Open`) }}</p>
  <p><template v-if="__i18nGetLocale() === 'zh'">{{ `第一行` }}<br />{{ `第二行` }}</template><template v-else>{{ `Line one` }}<br />{{ `line two` }}</template></p>
  <button @click="log(__i18nM1(__i18nGetLocale()))">{{ __i18nM1(__i18nGetLocale()) }}</button>
  <p>{{ `打开` }}</p>
  <p><template v-if="props.name === 'zh'">{{ `阅读` }}<a href="/docs">{{ `文档` }}</a>{{ `了解` }}<b>{{ `更多` }}</b>{{ `。` }}</template><template v-else>{{ `Read the ` }}<a href="/docs">{{ `docs` }}</a>{{ ` to learn ` }}<b>{{ `more` }}</b>{{ `.` }}</template></p>
  <p>{{ `你好` }}</p>
</template>
