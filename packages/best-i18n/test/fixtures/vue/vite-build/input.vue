<script setup lang="ts">
import { t } from 'best-i18n/macro'
import { Trans } from 'best-i18n/vue/macro'
</script>

<template>
  <h1>{{ t`Hello` }}</h1>
  <p><Trans>Read the <a href="/docs">docs</a>.</Trans></p>
</template>
