<script lang="ts">
  import { locales } from '$lib/i18n'
  import { deLocalizePathname, href } from '$lib/i18n/url.ts'
  import { locale } from 'svelte-i18n'

  const LABELS: Record<string, string> = {
    en: 'English',
    zh: '中文',
  }

  /** Remembers the choice in a cookie and navigates to the localized URL. */
  function switchLocale(item: string) {
    document.cookie = `LOCALE=${item}; path=/; max-age=31536000; SameSite=Lax`
    window.location.assign(
      href(deLocalizePathname(window.location.pathname), item),
    )
  }
</script>

<div>
  {#each locales as item (item)}
    <button
      type="button"
      aria-current={item === $locale ? 'true' : undefined}
      disabled={item === $locale}
      onclick={() => switchLocale(item)}
    >
      {LABELS[item] ?? item}
    </button>
  {/each}
</div>
