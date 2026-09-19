<script lang="ts">
  import { t } from 'best-i18n/macro'
  import { Trans } from 'best-i18n/svelte/macro'

  const name = 'best-i18n'
</script>

<h1>{t`About`}</h1>
<p>{t`${name} inlines every translation at the call site.`}</p>
<p>{t`Nothing is looked up at runtime, so nothing has to be loaded.`}</p>
<p>
  <Trans>
    Read the <a href="https://github.com/best-i18n/best-i18n">README</a> to learn
    more.
  </Trans>
</p>
