import type { Heading } from '../../content/rewrite'

// The section that holds a line of the original file: the last heading at or above it, or the first heading.
// A citation names a line; the reader opens a section, so an edit that moves the text by ten lines keeps the
// target of the citation.
export function sectionOfLine(headings: Heading[], line: number): string | null {
  let found: string | null = null
  for (const h of headings) {
    if (h.line > line) break
    found = h.slug
  }
  return found ?? headings[0]?.slug ?? null
}
