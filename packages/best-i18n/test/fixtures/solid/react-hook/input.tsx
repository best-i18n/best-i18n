import { useI18n } from 'best-i18n/react/macro';
export function Page() { const t = useI18n(); return <h1>{t`Hello`}</h1>; }
