// The site is statically exported and every page lives under /en or /zh, so
// nothing serves the bare root URL. This writes an out/index.html that sends
// the visitor to their language - JS sniffs `navigator.languages`, the meta
// refresh is the no-JS fallback, the links are the no-refresh fallback.
import { writeFile } from 'node:fs/promises'

const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>best-i18n</title>
<meta http-equiv="refresh" content="1;url=/en">
<script>
  var langs = navigator.languages || [navigator.language || 'en']
  var zh = langs.some(function (l) { return /^zh\\b/i.test(l) })
  location.replace(zh ? '/zh' : '/en')
</script>
<p><a href="/en">English</a> · <a href="/zh">中文</a></p>
`

await writeFile(new URL('../out/index.html', import.meta.url), html)
console.warn('postbuild: wrote out/index.html (locale redirect)')
