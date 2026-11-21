import type { RefObject } from 'react'
import { GUIDES } from '../guides/guides'
import { openGuide } from '../state/guide'
import { stopPlay } from '../state/play'
import { useApp } from '../state/store'
import { runAction } from './GuideCard'

// The list of the guides (the Guides button in the header opens it).
export function GuideList({ dialog }: { dialog: RefObject<HTMLDialogElement | null> }) {
  const set = useApp((s) => s.set)
  return (
    <dialog ref={dialog} data-testid="guide-list" aria-label="Guides" className="help-dialog" onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
      <h2>Guides</h2>
      <p>Each guide opens the views of its steps, and says what to look at.</p>
      <ul className="guide-items">
        {GUIDES.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              data-testid={`guide-${g.id}`}
              onClick={() => {
                stopPlay()
                set((s) => openGuide(s, g.id, 1))
                runAction(g.steps[0]!.action)
                dialog.current?.close()
              }}
            >
              <strong>{g.title}</strong> · {g.steps.length} steps
            </button>
            <div className="muted">{g.goal}</div>
          </li>
        ))}
      </ul>
    </dialog>
  )
}
