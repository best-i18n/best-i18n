import { createNavigation } from 'best-i18n/next/navigation'

import { i18n } from '@/i18n'

/** The locale-aware `Link`/`usePathname`/`useRouter`, bound to the config. */
export const { Link, usePathname, useRouter } = createNavigation(i18n)
