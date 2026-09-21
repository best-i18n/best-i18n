<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
</script>

<template>
  <p>
    <button type="button" @click="count++">{{ $t('add_one') }}</button>
    {{ $t('you_have_items', { count }) }}
  </p>
</template>
