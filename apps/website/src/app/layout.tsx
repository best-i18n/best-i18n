import { siteUrl } from '~/lib/shared'
import './global.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  // Root-level social images need the base URL before child metadata resolves.
  metadataBase: new URL(siteUrl),
}

// The real <html> layouts live one level down: `[lang]` is the tree we
// write, `(unprefixed)` the English mirror generated from it.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
