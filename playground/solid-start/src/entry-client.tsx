import { mount, StartClient } from '@solidjs/start/client'
import { configure, setLocale } from 'best-i18n/solid'
import { i18n } from './i18n.ts'

configure(i18n)
// Use the server-rendered language so hydration also matches static builds.
setLocale(document.documentElement.lang || i18n.baseLocale)
mount(() => <StartClient />, document.getElementById('app')!)
