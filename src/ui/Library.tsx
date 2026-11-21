import { useEffect, useMemo, useRef, useState } from 'react'
import { DOC_GROUPS } from '../../content/docs'
import { docById, docsOfGroup, hasSection, type Doc } from '../docs/content'
import { renderMarkdown, sectionsOf } from '../docs/render'
import { headingText } from '../docs/slug'
import type { Heading } from '../../content/rewrite'
import { routeOfHref } from '../docs/route'
import { useApp } from '../state/store'
import { closeDoc, openDoc, type Mode } from '../state/transitions'

// Library mode: the operator documents of the repository, read inside the portal.
//
// A document of the set is the file of the repository, rewritten at build time (content/rewrite.ts), so an
// edit of a runbook reaches this page with no step. The reader never leaves the app: a link in the body is a
// link to another document, and the return path goes back to the view that the reader came from.
export function Library() {
  const { doc, sec, docFrom, set } = useApp()
  const [filter, setFilter] = useState('')
  const current = docById(doc)
  const sections = current === null ? [] : sectionsOf(current.headings)
  const words = filter.trim().toLowerCase()
  return (
    <section className={`library${sections.length === 0 ? ' no-toc' : ''}`} data-testid="library">
      <nav className="lib-list" aria-label="The documents">
        <input
          type="text"
          className="lib-filter"
          placeholder="Filter the documents"
          aria-label="Filter the documents"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {DOC_GROUPS.map((g) => {
          const docs = docsOfGroup(g.id).filter((d) => d.title.toLowerCase().includes(words))
          if (docs.length === 0) return null
          return (
            <section key={g.id}>
              <h3>{g.label}</h3>
              <ul>
                {docs.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      data-testid={`lib-doc-${d.id}`}
                      aria-current={d.id === doc ? 'true' : undefined}
                      onClick={() => set((s) => openDoc(s, d.id))}
                    >
                      {d.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
        {words !== '' && DOC_GROUPS.every((g) => docsOfGroup(g.id).every((d) => !d.title.toLowerCase().includes(words))) && (
          <p className="muted">No document matches.</p>
        )}
      </nav>
      {current ? (
        <Reader doc={current} sec={hasSection(current, sec) ? sec : null} from={docFrom} />
      ) : (
        <div className="lib-reader">
          <div className="lib-welcome">
            <h1>The reference library</h1>
            <p>
              {DOC_GROUPS.map((g) => docsOfGroup(g.id).length).reduce((a, b) => a + b, 0)} documents: the runbooks of the catalogue, the
              operator reference, and the labs. Choose one on the left.
            </p>
            <p className="muted">A runbook gives the first 5 minutes, the checks, and the escalation. The reference gives the commands, the
              hardware matrix, and the concepts. The labs give the practice.</p>
          </div>
        </div>
      )}
      {sections.length > 0 && <Toc sections={sections} doc={current!} sec={hasSection(current, sec) ? sec : null} />}
    </section>
  )
}

function Reader({ doc, sec, from }: { doc: Doc; sec: string | null; from: Mode | null }) {
  const set = useApp((s) => s.set)
  const html = useMemo(() => renderMarkdown(doc.markdown, doc.headings), [doc])
  const box = useRef<HTMLDivElement>(null)
  // A section in the link: the reader opens at that heading. A document with no section opens at the top.
  useEffect(() => {
    const el = sec === null ? null : box.current?.querySelector<HTMLElement>(`#${CSS.escape(sec)}`)
    if (el) el.scrollIntoView({ block: 'start' })
    else box.current?.scrollTo({ top: 0 })
  }, [doc.id, sec])
  // A link in the body to another document of the set: the reader opens it, and no page reload happens.
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a')
    const href = a?.getAttribute('href') ?? ''
    if (!href.startsWith('#doc=')) return // a vendor page opens its tab
    e.preventDefault()
    const route = routeOfHref(href)
    if (route) set((s) => openDoc(s, route.doc, route.sec))
  }
  return (
    <div className="lib-reader" ref={box} data-testid="lib-reader">
      <div className="lib-head">
        <div>
          <h2 data-testid="lib-title">{doc.title}</h2>
          <span className="group">{DOC_GROUPS.find((g) => g.id === doc.group)?.label}</span>
        </div>
        {from !== null && (
          <button type="button" data-testid="lib-back" onClick={() => set(closeDoc)}>
            Back to the view
          </button>
        )}
      </div>
      {/* Two marks of a step stay in a runbook, and a reader needs to know what they are. */}
      {(doc.markdown.includes('[C:L') || doc.markdown.includes('[R]')) && (
        <details className="lib-marks">
          <summary>The marks of a step</summary>
          <p>
            <code>[C:L7]</code> is the stack layer of a step, from the GPU to the facility.
            <code>[R]</code> marks a step that a reference supports.
          </p>
        </details>
      )}
      {/* The body is our own document, rendered with raw HTML escaped (docs/render.ts). */}
      <div className="lib-body" data-testid="lib-body" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

function Toc({ doc, sec, sections }: { doc: Doc; sec: string | null; sections: Heading[] }) {
  const set = useApp((s) => s.set)
  return (
    <nav className="lib-toc" aria-label="The sections of this document" data-testid="lib-toc">
      <h3>Sections</h3>
      <ul>
        {sections.map((h) => (
          <li key={h.slug} className={h.level === 3 ? 'l3' : undefined}>
            <button type="button" aria-current={h.slug === sec ? 'true' : undefined} onClick={() => set((s) => openDoc(s, doc.id, h.slug))}>
              {headingText(h.text)}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
