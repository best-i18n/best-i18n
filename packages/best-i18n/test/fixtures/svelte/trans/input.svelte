<script lang="ts">
  import { t } from 'best-i18n/macro'
  import { Trans } from 'best-i18n/svelte/macro'
  let { url, name, count } = $props<{
    url: string
    name: string
    count: number
  }>()
</script>

<p>
  <Trans>
    Read the <a href={url}>docs</a> to learn more.
  </Trans>
</p>
<p>
  <Trans>Hi {name}, you have <b>{count} items</b>.</Trans>
</p>
<p><Trans>Just words.</Trans></p>
<p><Trans ctx="verb">Open</Trans></p>
<p><Trans>A <i>b <b>c</b></i> d</Trans></p>
<p><Trans>Line one<br />line two</Trans></p>
<p>{t`Hello`}</p>
