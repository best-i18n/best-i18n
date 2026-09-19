import { flushSync } from 'svelte';
import { configure, getLocale, setLocale } from 'best-i18n/svelte';

configure({ baseLocale: 'en', locales: ['en', 'zh'] });
const values = [];
const stop = $effect.root(() => {
  $effect(() => { values.push(getLocale()); });
});
flushSync();
setLocale('zh');
flushSync();
stop();
setLocale('en');
flushSync();
console.log(JSON.stringify(values));
