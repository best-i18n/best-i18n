<script lang="ts">
  import { _ } from 'svelte-i18n'

  const name = 'svelte-i18n'
</script>

<h1>{$_('about')}</h1>
<p>{$_('inlines', { values: { name } })}</p>
<p>{$_('no_runtime')}</p>
<!--
  svelte-i18n messages are strings, so a sentence with a link in it is split
  into three keys by hand - and the split fixes the word order for every
  language.
-->
<p>
  {$_('read_the')}<a href="https://github.com/best-i18n/best-i18n"
    >{$_('readme')}</a
  >{$_('to_learn_more')}
</p>
