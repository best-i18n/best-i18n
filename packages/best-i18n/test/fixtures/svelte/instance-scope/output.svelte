<script module>
import { getLocale as __i18nGetLocale } from "best-i18n/svelte";
  const t = (s) => s[0]
  export const title = t`Untouched`
</script>


<h1>{(__i18nGetLocale() === "zh" ? `你好` : `Hello`)}</h1>
