<script setup lang="ts">
const { locale, locales, setLocale } = useI18n()
</script>

<template>
  <div>
    <button
      v-for="item in locales"
      :key="item.code"
      type="button"
      :aria-current="item.code === locale ? 'true' : undefined"
      :disabled="item.code === locale"
      @click="setLocale(item.code)"
    >
      {{ item.name }}
    </button>
  </div>
</template>
