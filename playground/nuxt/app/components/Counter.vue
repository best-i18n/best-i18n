<script setup lang="ts">
import { t } from 'best-i18n/macro'
import { computed, ref } from 'vue'

const count = ref(0)
// Script text that should follow the locale lives in a computed; a plain
// `const` would be evaluated once.
const items = computed(() => t`You have ${count.value} items`)
</script>

<template>
  <p>
    <button type="button" @click="count++">{{ t`Add one` }}</button>
    {{ items }}
  </p>
</template>
