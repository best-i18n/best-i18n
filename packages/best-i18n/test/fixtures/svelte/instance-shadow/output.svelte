<script module>
import { getLocale as __i18nGetLocale } from "best-i18n/svelte";
    export const title = (__i18nGetLocale() === "zh" ? `你好` : `Hello`)
</script>

<script>
  const t = (s) => `local:${s[0]}`
</script>

<h1>{t`Untouched`}</h1>
