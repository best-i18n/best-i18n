import { createFromSource } from 'fumadocs-core/search/server'
import { source } from '~/lib/source'

export const revalidate = false

// The default multilingual tokenizer covers every language, zh included.
export const { staticGET: GET } = createFromSource(source)
