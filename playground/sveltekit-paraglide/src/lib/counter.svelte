<script lang="ts">
  import { m } from '$lib/paraglide/messages'

  let count = $state(0)
</script>

<p>
  <button type="button" onclick={() => (count += 1)}>
    {m.add_one()}
  </button>
  {m.you_have_items({ count })}
</p>
