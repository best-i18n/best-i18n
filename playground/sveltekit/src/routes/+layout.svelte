<script lang="ts">
  import { href } from '$lib/href.svelte'
  import LocaleSwitcher from '$lib/locale-switcher.svelte'
  import { t } from 'best-i18n/macro'
  import '../app.css'

  let { children } = $props()
</script>

<header>
  <nav>
    <a href={href('/')}>{t`Home`}</a>
    <a href={href('/about')}>{t`About`}</a>
  </nav>
  <LocaleSwitcher />
</header>
<main>
  {@render children()}
</main>
