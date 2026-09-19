<script lang="ts">
    let { name, count } = $props<{ name: string; count: number }>();
  let title = $derived(`你好`);
</script>
<!-- 中文 😀 -->
<h1 title={`你好`}>{`你好 ${name}`}</h1>
{#if count > 0}<p>{((__i18nN, __i18nI = +(__i18nN != 1)) => __i18nI === 1 ? `${count} items` : `One item`)(count)}</p>{/if}
<style>h1 { color: red; }</style>
