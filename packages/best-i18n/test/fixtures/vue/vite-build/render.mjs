import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { withLocale } from 'best-i18n/server';
import Component from './component.mjs';
console.log(await withLocale('zh', () => renderToString(createSSRApp(Component))));
