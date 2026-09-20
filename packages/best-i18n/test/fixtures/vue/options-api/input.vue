<script>
import { t } from 'best-i18n/macro'

export default {
  computed: {
    title() {
      return t`Hello`
    },
  },
}
</script>

<template>
  <h1>{{ title }}</h1>
</template>
