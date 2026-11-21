import { useMemo } from 'react'
import { CHECKLISTS, CHECKLIST_NOTE, LAYER_LABEL, stepKey } from '../catalog/checklists'
import { RUNBOOKS, type RunbookId } from '../catalog/runbooks'
import { incidentOf } from '../diagnose/incidents'
import { timelineOf } from '../diagnose/timeline'
import { chainOf } from '../diagnose/verdict'
import { useApp } from '../state/store'
import { closeChecklist, toggleStep } from '../state/transitions'
import { downloadText } from './download'
import { RunbookLinks } from './Runbooks'
import { SourceRef } from './SourceRef'

// The checklist of one runbook, in place: the read-only steps of section 3, then one mitigation row, with the
// gate and the undo. It is the inspector of Simulate mode while a checklist is open (Appendix A, A6).
export function ChecklistPanel() {
  const { diag, config, failures, set } = useApp()
  const id = diag.checklist as RunbookId
  const runbook = RUNBOOKS.find((r) => r.id === id)
  const steps = CHECKLISTS[id] ?? []
  const chain = useMemo(() => {
    const incident = incidentOf(diag.incident, config, failures)
    return incident ? chainOf(incident) : null
  }, [diag.incident, config, failures])
  if (!runbook) return null
  const done = steps.filter((s) => diag.done.includes(stepKey(id, s.n)))
  return (
    <section className="panel">
      <h2 data-testid="checklist-title">{id} checklist</h2>
      <p className="summary">{runbook.title}</p>
      <p data-testid="checklist-progress">
        {done.length} of {steps.length} steps done.
      </p>
      <ol className="checklist">
        {steps.map((s) => (
          <li key={s.n} data-testid={`check-step-${s.n}`}>
            <label>
              <input
                type="checkbox"
                data-testid={`check-box-${s.n}`}
                checked={diag.done.includes(stepKey(id, s.n))}
                onChange={() => set((st) => toggleStep(st, id, s.n))}
              />{' '}
              Step {s.n}
              {diag.at[stepKey(id, s.n)] && <span className="note"> ({diag.at[stepKey(id, s.n)]})</span>}
            </label>
            <code>{s.command}</code>
            <dl className="lifecycle-detail">
              <dt>Expected</dt>
              <dd>{s.expected}</dd>
              <dt>Layer</dt>
              <dd>{s.layer ? LAYER_LABEL[s.layer] : 'none: the runbook tag names a section or an environment variable'}</dd>
              <dt>Who runs it</dt>
              <dd>{s.who}</dd>
              <dt>Gate</dt>
              <dd>{s.gate}</dd>
              <dt>Undo</dt>
              <dd>{s.undo}</dd>
              <dt>Source</dt>
              <dd>
                <SourceRef source={s.source.source} title={s.says}>
                  the line of the runbook
                </SourceRef>
              </dd>
            </dl>
          </li>
        ))}
      </ol>
      <div className="buttons">
        <button
          type="button"
          data-testid="checklist-export"
          disabled={chain === null}
          onClick={() => {
            if (!chain) return
            const { name, text } = timelineOf(chain, diag)
            downloadText(name, text, 'text/markdown')
          }}
        >
          Export the timeline
        </button>
        <button type="button" data-testid="checklist-close" onClick={() => set(closeChecklist)}>
          Close the checklist
        </button>
      </div>
      <RunbookLinks r={runbook} />
      <p className="note">
        {CHECKLIST_NOTE.value}. The layer is the stack layer of the runbook tag; the "who" rule is the one of the runbook.
      </p>
    </section>
  )
}
