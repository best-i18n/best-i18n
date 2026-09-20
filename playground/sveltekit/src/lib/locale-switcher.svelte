<script lang="ts">
  import { i18n } from '$lib/i18n'
  import { switchLocale } from 'best-i18n/client'
  import { locale } from 'best-i18n/svelte'

  const LABELS: Record<string, string> = {
    en: 'English',
    zh: '中文',
  }
</script>

<div>
  {#each i18n.locales as item (item)}
    <button
      type="button"
      aria-current={item === locale.current ? 'true' : undefined}
      disabled={item === locale.current}
      onclick={() => switchLocale(item, i18n)}
    >
      {LABELS[item] ?? item}
    </button>
  {/each}
</div>
