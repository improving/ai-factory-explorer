// The Markdown of a document, as HTML for the reader.
//
// Raw HTML in a document is escaped and not passed through: no document of the set carries HTML (the
// angle brackets in the text are placeholders such as <node>, and they are in code spans), and an escape
// is safer than a sanitiser package. The id of a heading is the slug that the build made, in the order of
// the document, so a link to a section and the table of contents always agree with it.

import { Marked } from 'marked'
import type { Heading } from '../../content/rewrite'

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderMarkdown(markdown: string, headings: Heading[]): string {
  let n = 0
  const md = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens)
        const slug = headings[n++]?.slug
        return `<h${depth}${slug === undefined ? '' : ` id="${slug}"`}>${inner}</h${depth}>\n`
      },
      html({ text }) {
        return escapeHtml(text)
      },
    },
  })
  return md.parse(markdown) as string
}

// The sections of a document for the table of contents: the title and the first two levels below it.
export const sectionsOf = (headings: Heading[]): Heading[] => headings.filter((h) => h.level === 2 || h.level === 3)
