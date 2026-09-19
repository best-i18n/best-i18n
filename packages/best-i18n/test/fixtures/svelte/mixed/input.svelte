<script lang="ts">
  import { t as translate, plural } from 'best-i18n/macro';
  let { name, count } = $props<{ name: string; count: number }>();
  let title = $derived(translate`Hello`);
</script>
<!-- 中文 😀 -->
<h1 title={translate`Hello`}>{translate`Hi ${name}`}</h1>
{#if count > 0}<p>{plural(count, `One item`, `${count} items`)}</p>{/if}
<style>h1 { color: red; }</style>
