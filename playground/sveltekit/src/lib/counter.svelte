<script lang="ts">
  import { t } from 'best-i18n/macro'

  let count = $state(0)
  let items = $derived(t`You have ${count} items`)
</script>

<p>
  <button type="button" onclick={() => (count += 1)}>
    {t`Add one`}
  </button>
  {items}
</p>
