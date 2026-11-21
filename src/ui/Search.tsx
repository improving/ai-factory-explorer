import { useMemo, useState, type ReactNode } from 'react'
import { findParts, type Hit } from '../search/search'
import { useApp } from '../state/store'
import { goTo, openDoc } from '../state/transitions'
import { docRoute } from '../refs'

export const SEARCH_BOX = 'search-box'

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The label with the start of each query word in bold.
function marked(label: string, query: string): ReactNode {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  if (words.length === 0) return label
  const re = new RegExp(`(${words.map(escape).join('|')})`, 'gi')
  return label.split(re).map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part))
}

// Spec 5.5: find a part by name or kind, open the view that shows it, and select it. A written runbook opens in the Library.
// In a node view, the parts of that server come first.
export function Search() {
  const config = useApp((s) => s.config)
  const telemetry = useApp((s) => s.overlay.telemetry)
  const context = useApp((s) => (s.view.level === 'node' ? s.view.serverId : null))
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [focused, setFocused] = useState(false)
  const found = useMemo(() => findParts(config, query, telemetry, 10, context), [config, query, telemetry, context])
  const listed = focused && query.trim() !== ''
  const last = found.hits.length - 1
  const current = Math.min(active, Math.max(last, 0)) // the list can get shorter (a config change)

  const open = (hit: Hit | undefined, box: HTMLInputElement) => {
    if (!hit) return
    if (hit.where.level === 'link') {
      const route = docRoute(hit.where.source)
      if (route) useApp.getState().set((s) => openDoc(s, route.doc, route.sec))
    }
    else useApp.getState().set((s) => goTo(s, hit))
    setQuery('')
    setActive(0)
    box.blur()
  }
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(Math.max(0, Math.min(current + 1, last)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(Math.max(current - 1, 0))
    } else if (e.key === 'Enter') open(found.hits[current], e.currentTarget)
    else if (e.key === 'Escape') {
      setQuery('')
      e.currentTarget.blur()
    }
  }

  return (
    <div className="search">
      <svg className="search-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input
        id={SEARCH_BOX}
        type="text"
        role="combobox"
        aria-label="Search parts and runbooks"
        aria-autocomplete="list"
        aria-expanded={listed}
        aria-controls="search-list"
        aria-activedescendant={listed && found.hits.length > 0 ? `search-opt-${current}` : undefined}
        placeholder="Search parts and runbooks"
        autoComplete="off"
        spellCheck={false}
        data-testid="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKey}
      />
      {query === '' ? (
        <kbd className="search-key" aria-hidden="true">
          /
        </kbd>
      ) : (
        <button
          type="button"
          className="search-clear"
          aria-label="Remove the search text"
          // mousedown, not click: the box keeps the focus.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setQuery('')
            setActive(0)
          }}
        >
          ×
        </button>
      )}
      {listed && (
        <ul id="search-list" role="listbox" className="search-list" data-testid="search-list">
          {found.hits.map((h, i) => (
            <SearchRow key={h.id} hit={h} i={i} heading={h.kind !== found.hits[i - 1]?.kind} active={i === current} query={query} onOpen={() => open(h, document.getElementById(SEARCH_BOX) as HTMLInputElement)} />
          ))}
          {found.hits.length === 0 && (
            <li role="presentation" className="muted">
              No part matches
            </li>
          )}
          {found.total > found.hits.length && (
            <li role="presentation" className="muted">
              {found.total - found.hits.length} more: type more of the name
            </li>
          )}
          <li role="presentation" className="muted hint">
            ↑↓ select · Enter open · Esc close
          </li>
        </ul>
      )}
    </div>
  )
}

function SearchRow({ hit: h, i, heading, active, query, onOpen }: { hit: Hit; i: number; heading: boolean; active: boolean; query: string; onOpen: () => void }) {
  return (
    <>
      {heading && (
        <li role="presentation" className="group">
          {h.kind}
        </li>
      )}
      <li
        id={`search-opt-${i}`}
        role="option"
        aria-selected={active}
        // mousedown, not click: the box keeps the focus until the result opens.
        onMouseDown={(e) => {
          e.preventDefault()
          onOpen()
        }}
      >
        <span>{marked(h.label, query)}</span> {h.id !== h.label && <span className="muted">{marked(h.id, query)}</span>}
      </li>
    </>
  )
}
