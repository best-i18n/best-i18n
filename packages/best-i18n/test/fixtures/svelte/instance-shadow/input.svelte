<script module>
  import { t } from 'best-i18n/macro'
  export const title = t`Hello`
</script>

<script>
  const t = (s) => `local:${s[0]}`
</script>

<h1>{t`Untouched`}</h1>
