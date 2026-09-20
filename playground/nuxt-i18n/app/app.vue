<script setup lang="ts">
const localePath = useLocalePath()
const { locale } = useI18n()
// The module does not set <html lang> on its own; the best-i18n playground
// does, so match it.
useHead({ htmlAttrs: { lang: locale } })
</script>

<template>
  <header>
    <nav>
      <NuxtLink :to="localePath('/')">{{ $t('home') }}</NuxtLink>
      <NuxtLink :to="localePath('/about')">{{ $t('about') }}</NuxtLink>
    </nav>
    <LocaleSwitcher />
  </header>
  <main>
    <NuxtPage />
  </main>
</template>
