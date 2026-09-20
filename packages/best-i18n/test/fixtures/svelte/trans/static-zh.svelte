<script lang="ts">
      let { url, name, count } = $props<{
    url: string
    name: string
    count: number
  }>()
</script>

<p>
  {`阅读`}<a href={url}>{`文档`}</a>{`了解更多。`}
</p>
<p>
  {`阅读`}<a href={url}>{`文档`}</a>{`了解更多。`}
</p>
<p>
  {`你好 ${name}，你有 `}<b>{`${count} 项`}</b>{`。`}
</p>
<p>{`只有文字。`}</p>
<p>{`打开`}</p>
<p>{`D `}<i><b>{`C`}</b>{` B`}</i>{` A`}</p>
<p>{`第一行`}<br />{`第二行`}</p>
<p>{`你好`}</p>
