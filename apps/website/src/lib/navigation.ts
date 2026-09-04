import { createNavigation } from 'best-i18n/next/navigation'

import { i18nConfig } from './best-i18n'

/** Locale-aware navigation bound to the site's config (`prefixBase` included). */
export const { Link, usePathname, useRouter } = createNavigation(i18nConfig)
