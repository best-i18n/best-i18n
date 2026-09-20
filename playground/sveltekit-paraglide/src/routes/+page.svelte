<script lang="ts">
  import Counter from '$lib/counter.svelte'
  import { m } from '$lib/paraglide/messages'
</script>

<h1>{m.starter()}</h1>
<p>{m.rendered_on_server()}</p>
<Counter />
