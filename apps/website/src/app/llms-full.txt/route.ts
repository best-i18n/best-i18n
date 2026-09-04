import { i18n } from '~/lib/i18n'
import { getLLMText, source } from '~/lib/source'

export const revalidate = false

export async function GET() {
  // English only: the zh pages are translations of the same content, and this
  // file is consumed whole - doubling it buys tokens, not information. The
  // zh originals stay reachable per page via /zh/llms.mdx/docs/*.
  const scan = source.getPages(i18n.defaultLanguage).map(getLLMText)
  const scanned = await Promise.all(scan)

  return new Response(scanned.join('\n\n'))
}
