import type { ReactNode } from 'react'
import { docById } from '../docs/content'
import { headingText } from '../docs/slug'
import { useApp } from '../state/store'
import { openDoc } from '../state/transitions'

// The button that opens a document of the portal at a section.
//
// It replaces the link to GitHub that each panel had. It keeps the state of the view, so "Back to the view"
// returns to the selected part with its overlays and its tab. The tooltip says where the button opens, and
// `name` gives a screen reader the words when the label is short ("Source", or a badge).
export function Read({
  doc,
  sec,
  children,
  className,
  title,
  name,
}: {
  doc: string
  sec: string | null
  children: ReactNode
  className?: string
  title?: string
  name?: string
}) {
  const set = useApp((s) => s.set)
  const target = docById(doc)
  const heading = sec === null ? null : target?.headings.find((h) => h.slug === sec)
  const where = target === null ? 'the Library' : `${target.title}${heading === undefined || heading === null ? '' : `, ${headingText(heading.text)}`}`
  return (
    <button
      type="button"
      className={`read${className === undefined ? '' : ` ${className}`}`}
      title={title ?? `Open in the Library: ${where}`}
      aria-label={name}
      onClick={() => set((s) => openDoc(s, doc, sec))}
    >
      {children}
    </button>
  )
}
