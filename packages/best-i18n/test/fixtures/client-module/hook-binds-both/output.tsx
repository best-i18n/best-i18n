'use client'
import { useLocale as __i18nUseLocale } from "best-i18n/react";

export function A() {
  const t = __i18nUseLocale()
  return (
    <p>
      {(t === "zh" ? `关于` : `About`)}
      {(t === "zh" ? `关于` : `About`)}
    </p>
  )
}
