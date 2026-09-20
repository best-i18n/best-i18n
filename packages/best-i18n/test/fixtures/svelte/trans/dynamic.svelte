<script lang="ts">
import { getLocale as __i18nGetLocale } from "best-i18n/svelte";
      let { url, name, count } = $props<{
    url: string
    name: string
    count: number
  }>()
</script>

<p>
  {#if __i18nGetLocale() === "zh"}{`阅读`}<a href={url}>{`文档`}</a>{`了解更多。`}{:else}{`Read the `}<a href={url}>{`docs`}</a>{` to learn more.`}{/if}
</p>
<p>
  {#if __i18nGetLocale() === "zh"}{`阅读`}<a href={url}>{`文档`}</a>{`了解更多。`}{:else}{`Read the `}<a href={url}>{`docs`}</a>{` to learn more.`}{/if}
</p>
<p>
  {#if __i18nGetLocale() === "zh"}{`你好 ${name}，你有 `}<b>{`${count} 项`}</b>{`。`}{:else}{`Hi ${name}, you have `}<b>{`${count} items`}</b>{`.`}{/if}
</p>
<p>{(__i18nGetLocale() === "zh" ? `只有文字。` : `Just words.`)}</p>
<p>{(__i18nGetLocale() === "zh" ? `打开` : `Open`)}</p>
<p>{#if __i18nGetLocale() === "zh"}{`D `}<i><b>{`C`}</b>{` B`}</i>{` A`}{:else}{`A `}<i>{`b `}<b>{`c`}</b></i>{` d`}{/if}</p>
<p>{#if __i18nGetLocale() === "zh"}{`第一行`}<br />{`第二行`}{:else}{`Line one`}<br />{`line two`}{/if}</p>
<p>{(__i18nGetLocale() === "zh" ? `你好` : `Hello`)}</p>
