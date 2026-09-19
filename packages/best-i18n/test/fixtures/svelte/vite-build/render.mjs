import { render } from 'svelte/server';
import { withLocale } from 'best-i18n/server';
import Component from './component.mjs';
console.log(withLocale('zh', () => render(Component).body));
