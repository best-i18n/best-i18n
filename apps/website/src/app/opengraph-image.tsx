import { generate as DefaultImage } from 'fumadocs-ui/og'
import { ImageResponse } from 'next/og'
import { Logo } from '~/components/logo'
import { appName } from '~/lib/shared'

export const dynamic = 'force-static'

export const alt = 'best-i18n — Compile-time i18n'
// oxlint-disable-next-line react/only-export-components -- Next.js image metadata
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    <DefaultImage
      title={appName}
      description='Compile-time i18n: no keys, no runtime, no catalog to load. Translations inline at the call site.'
      site={appName}
      icon={<Logo />}
      primaryColor='rgba(126, 231, 135, 0.3)'
      primaryTextColor='#7ee787'
    />,
    size,
  )
}
