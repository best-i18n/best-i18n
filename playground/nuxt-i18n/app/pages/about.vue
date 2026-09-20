<script setup lang="ts">
const name = 'nuxt-i18n'
</script>

<template>
  <h1>{{ $t('about') }}</h1>
  <p>{{ $t('inlines', { name }) }}</p>
  <p>{{ $t('no_runtime') }}</p>
  <!--
    vue-i18n messages are strings, so a sentence with a link in it is split
    into three keys by hand - and the split fixes the word order for every
    language. (i18n-t with slots exists, at the cost of a component per
    sentence.)
  -->
  <p>
    {{ $t('read_the') }}<a href="https://github.com/best-i18n/best-i18n">{{ $t('readme') }}</a
    >{{ $t('to_learn_more') }}
  </p>
</template>
