declare global {
  namespace App {
    interface Locals {
      locale: import('$lib/i18n').Locale
    }
  }
}

export {}
