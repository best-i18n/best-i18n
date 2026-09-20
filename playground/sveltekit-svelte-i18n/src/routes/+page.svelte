<script lang="ts">
  import Counter from '$lib/counter.svelte'
  import { _ } from 'svelte-i18n'
</script>

<h1>{$_('starter')}</h1>
<p>{$_('rendered_on_server')}</p>
<Counter />
