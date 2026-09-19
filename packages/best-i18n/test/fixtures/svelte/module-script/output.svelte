<script module>
import { getLocale as __i18nGetLocale } from "best-i18n/svelte";
const __i18nM1 = (l) => (l === "zh" ? `你好` : `Hello`); export const title = __i18nM1(__i18nGetLocale());</script><h1>{__i18nM1(__i18nGetLocale())}</h1>
