<script lang="ts">
  import { m } from '$lib/paraglide/messages'

  const name = 'paraglide'
</script>

<h1>{m.about()}</h1>
<p>{m.inlines({ name })}</p>
<p>{m.no_runtime()}</p>
<!--
  Paraglide messages are plain strings, so a sentence with a link in it has
  to be split into three of them by hand - and the split fixes the word order
  for every language.
-->
<p>
  {m.read_the()}<a href="https://github.com/best-i18n/best-i18n">{m.readme()}</a
  >{m.to_learn_more()}
</p>
