import { flushSync } from 'svelte';
import { configure, getLocale, locale, setLocale } from 'best-i18n/svelte';

configure({ baseLocale: 'en', locales: ['en', 'zh'] });
const values = [];
const current = [];
const stop = $effect.root(() => {
  $effect(() => { values.push(getLocale()); });
  $effect(() => { current.push(locale.current); });
});
flushSync();
setLocale('zh');
flushSync();
stop();
setLocale('en');
flushSync();
console.log(JSON.stringify({ values, current }));
