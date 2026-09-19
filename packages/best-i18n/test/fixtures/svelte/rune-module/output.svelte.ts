import { getLocale as __i18nGetLocale } from "best-i18n/svelte";
 const title = $derived((__i18nGetLocale() === "zh" ? `你好` : `Hello`));
