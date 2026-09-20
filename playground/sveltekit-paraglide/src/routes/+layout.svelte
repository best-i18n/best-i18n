<script lang="ts">
  import LocaleSwitcher from '$lib/locale-switcher.svelte'
  import { m } from '$lib/paraglide/messages'
  import { localizeHref } from '$lib/paraglide/runtime'
  import '../app.css'

  let { children } = $props()
</script>

<header>
  <nav>
    <a href={localizeHref('/')}>{m.home()}</a>
    <a href={localizeHref('/about')}>{m.about()}</a>
  </nav>
  <LocaleSwitcher />
</header>
<main>
  {@render children()}
</main>
