import { writeFileSync } from 'node:fs';
import { renderToString, generateHydrationScript } from 'solid-js/web';
import { withLocale } from 'best-i18n/server';
import { Page } from './ssr.mjs';
for (const locale of ['en', 'zh']) {
  const html = withLocale(locale, () => renderToString(() => Page({ count: 1 })));
  writeFileSync(new URL(`./${locale}.html`, import.meta.url), html);
}

writeFileSync(new URL('./hydration.js', import.meta.url), generateHydrationScript().match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]);
