<script setup lang="ts">
import { computed } from 'vue'
import { plural, t } from 'best-i18n/macro'
import { Trans } from 'best-i18n/vue/macro'

const props = defineProps<{ name: string; count: number }>()
const title = computed(() => t`Hello`)
</script>

<template>
  <h1 :title="t`Say 'hi'`">{{ title }}</h1>
  <!-- i18n: greets the signed-in user -->
  <p>{{ t`Hi ${props.name}` }}</p>
  <p>{{ plural(props.count, `One item`, `${props.count} items`) }}</p>
  <p>
    <Trans>
      Read the <a href="/docs">docs</a>
      to learn <b>more</b>.
    </Trans>
  </p>
  <p><Trans ctx="verb">Open</Trans></p>
  <p><Trans>Line one<br />line two</Trans></p>
  <button @click="log(t`Hello`)">{{ t`Hello` }}</button>
</template>
