<script lang="ts">
import { getLocale as __i18nGetLocale } from "best-i18n/svelte";
const __i18nM1 = (l) => (l === "zh" ? `你好` : `Hello`);
    let { name, count } = $props<{ name: string; count: number }>();
  let title = $derived(__i18nM1(__i18nGetLocale()));
</script>
<!-- 中文 😀 -->
<h1 title={__i18nM1(__i18nGetLocale())}>{(__i18nGetLocale() === "zh" ? `你好 ${name}` : `Hi ${name}`)}</h1>
{#if count > 0}<p>{(__i18nGetLocale() === "zh" ? ((__i18nN, __i18nI = +(__i18nN != 1)) => __i18nI === 1 ? `${count} items` : `One item`)(count) : ((__i18nN, __i18nI = +(__i18nN != 1)) => __i18nI === 1 ? `${count} items` : `One item`)(count))}</p>{/if}
<style>h1 { color: red; }</style>
