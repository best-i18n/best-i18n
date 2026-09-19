<script lang="ts">
  import Counter from '$lib/counter.svelte'
  import { t } from 'best-i18n/macro'
</script>

<h1>{t`A small starter with room to grow.`}</h1>
<p>{t`This paragraph was rendered on the server.`}</p>
<Counter />
