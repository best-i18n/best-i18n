<script lang="ts">
  import { href } from '$lib/i18n/url.ts'
  import LocaleSwitcher from '$lib/locale-switcher.svelte'
  import { _, locale } from 'svelte-i18n'
  import '../app.css'

  let { children } = $props()
</script>

<header>
  <nav>
    <a href={href('/', $locale)}>{$_('home')}</a>
    <a href={href('/about', $locale)}>{$_('about')}</a>
  </nav>
  <LocaleSwitcher />
</header>
<main>
  {@render children()}
</main>
