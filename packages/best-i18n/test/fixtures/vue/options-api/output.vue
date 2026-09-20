<script>
import { getLocale as __i18nGetLocale } from "best-i18n/vue";

export default {
  computed: {
    title() {
      return (__i18nGetLocale() === "zh" ? `你好` : `Hello`)
    },
  },
}
</script>

<template>
  <h1>{{ title }}</h1>
</template>
