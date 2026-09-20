<script lang="ts">
  import { getLocale, locales, setLocale } from '$lib/paraglide/runtime'

  const LABELS: Record<string, string> = {
    en: 'English',
    zh: '中文',
  }

  // Not reactive: paraglide's setLocale() navigates to the localized URL, so
  // the component is rendered again from scratch.
  const locale = getLocale()
</script>

<div>
  {#each locales as item (item)}
    <button
      type="button"
      aria-current={item === locale ? 'true' : undefined}
      disabled={item === locale}
      onclick={() => setLocale(item)}
    >
      {LABELS[item] ?? item}
    </button>
  {/each}
</div>
