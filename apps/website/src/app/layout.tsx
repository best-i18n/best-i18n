import './global.css'

// The real <html> layouts live one level down: `[lang]` is the tree we
// write, `(unprefixed)` the English mirror generated from it.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
