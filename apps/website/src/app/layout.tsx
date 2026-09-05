import './global.css'

// The real <html> layouts live one level down: `(main)` renders the
// unprefixed English tree, `[lang]` the locale-prefixed one.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
