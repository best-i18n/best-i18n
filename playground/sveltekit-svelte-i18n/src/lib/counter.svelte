<script lang="ts">
  import { _ } from 'svelte-i18n'

  let count = $state(0)
</script>

<p>
  <button type="button" onclick={() => (count += 1)}>
    {$_('add_one')}
  </button>
  {$_('you_have_items', { values: { count } })}
</p>
