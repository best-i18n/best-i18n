<script lang="ts">
  import { i18n } from '$lib/i18n'
  import { switchLocale } from 'best-i18n/client'
  import { getLocale } from 'best-i18n/svelte'

  const LABELS: Record<string, string> = {
    en: 'English',
    zh: '中文',
  }

  const locale = $derived(getLocale())
</script>

<div>
  {#each i18n.locales as item (item)}
    <button
      type="button"
      aria-current={item === locale ? 'true' : undefined}
      disabled={item === locale}
      onclick={() => switchLocale(item, i18n)}
    >
      {LABELS[item] ?? item}
    </button>
  {/each}
</div>
