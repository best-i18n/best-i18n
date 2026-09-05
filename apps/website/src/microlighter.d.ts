// microlighter ships no type declarations (plain JS package).
declare module 'microlighter' {
  export interface HighlightAllOptions {
    /** Element or document to search. @default document */
    root?: Document | Element
    /** Selector used to find code blocks. @default 'pre > code' */
    selector?: string
    /** Extra aliases mapped to bundled grammars. */
    languageAliases?: Record<string, string>
  }

  /** Highlights every matching code block; resolves with the elements. */
  export function highlightAll(
    options?: HighlightAllOptions,
  ): Promise<HTMLElement[]>
}
