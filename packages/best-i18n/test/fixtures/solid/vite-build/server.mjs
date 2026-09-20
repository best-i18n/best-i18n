import assert from 'node:assert/strict';
import { renderToString } from 'solid-js/web';
import { withLocale } from 'best-i18n/server';
import { Words, Rich } from './component.mjs';
await Promise.all(['en', 'zh'].map(locale => withLocale(locale, async () => {
  await new Promise(resolve => setTimeout(resolve, locale === 'en' ? 10 : 1));
  const language = process.env.STATIC_LOCALE || locale;
  const html = renderToString(() => [Words(), Rich({ href: '/docs' })]);
  assert.ok(html.includes(language === 'zh' ? '你好' : 'Hello'));
  assert.ok(html.includes(language === 'zh' ? '文档' : 'docs'));
})));
console.log('ok');
