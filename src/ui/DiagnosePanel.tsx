import { useMemo } from 'react'
import { checklistOf } from '../catalog/checklists'
import { runbookOfRow } from '../catalog/runbooks'
import { CLASS_INFO, CURRENT_INCIDENT, DIAG_CLASS_NOTE, INCIDENTS, type IncidentView } from '../diagnose/incidents'
import { timelineOf } from '../diagnose/timeline'
import { SUB_LABEL, VERDICT_RULE, settleOf, type Chain } from '../diagnose/verdict'
import { useApp } from '../state/store'
import { openChecklist, select, setIncident } from '../state/transitions'
import { openGuide, stepNumber } from '../state/guide'
import { downloadText } from './download'
import { RunbookLinks } from './Runbooks'
import { rowKeys } from './rowKeys'

// The guide of this panel: the step of "Simulate a failure" that shows the verdict of a failure.
function GuideButton() {
  const { set } = useApp()
  const n = stepNumber('simulate', 'The verdict of the failure')
  if (n === null) return null
  return (
    <button type="button" data-testid="diag-guide" title="Open the guide at this step" onClick={() => set((s) => openGuide(s, 'simulate', n))}>
      Guide
    </button>
  )
}

// The chain of one incident, the verdict, and the two actions: the checklist of a runbook, and the timeline.
// It is the bottom panel of Simulate mode, beside the impact panel (Appendix A, A5).
export function DiagnosePanel({ chain, incident }: { chain: Chain; incident: IncidentView }) {
  const { diag, selected, set } = useApp()
  const settle = useMemo(() => settleOf(chain), [chain])
  const v = chain.verdict
  const first = settle.find((r) => checklistOf(r.id))
  const head = `${SUB_LABEL[v.sub]}${v.cls ? `: ${CLASS_INFO[v.cls].short}` : ''}${v.node ? ` on ${v.node}` : ''}`
  return (
    <section className="portmap diag-panel" data-testid="diag-panel">
      <div className="diag-head">
        <label className="inline">
          Incident
          <select data-testid="diag-incident" value={diag.incident} onChange={(e) => set((s) => setIncident(s, e.target.value))}>
            <option value={CURRENT_INCIDENT}>The failures of the simulator</option>
            {INCIDENTS.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        <span className="status-line" data-testid="diag-verdict" aria-live="polite" title={v.why}>
          {head}
        </span>
        {first && (
          <button type="button" data-testid="diag-open-checklist" onClick={() => set((s) => openChecklist(s, first.id))}>
            Open the checklist of {first.id}
          </button>
        )}
        <GuideButton />
        <button
          type="button"
          data-testid="diag-export"
          onClick={() => {
            const { name, text } = timelineOf(chain, diag)
            downloadText(name, text, 'text/markdown')
          }}
        >
          Export the timeline
        </button>
      </div>
      <p className="note" data-testid="diag-story">
        {incident.story.join(' ')}
      </p>
      {chain.rows.length === 0 ? (
        <p className="note" data-testid="diag-empty">
          No failure in the simulator. Inject one in Simulate mode, or pick a saved incident.
        </p>
      ) : (
        <>
          <table className="specs diag-chain" data-testid="diag-chain">
            <thead>
              <tr>
                <th>#</th>
                <th>Time</th>
                <th>Source</th>
                <th>Event</th>
                <th>Class</th>
                <th>Runbook</th>
              </tr>
            </thead>
            <tbody>
              {chain.rows.map((r) => {
                const runbook = r.row ? runbookOfRow(r.row) : null
                const pick = () => r.subject && set((s) => select(s, r.subject!))
                return (
                  <tr
                    key={r.i}
                    data-testid={`diag-row-${r.i}`}
                    className={[r.subject ? 'subject' : '', r.subject && selected === r.subject ? 'on' : ''].join(' ').trim() || undefined}
                    onClick={pick}
                    {...(r.subject ? rowKeys(pick) : {})}
                  >
                    <td>{r.i + 1}</td>
                    <td>{r.clock}</td>
                    <td>{r.src}</td>
                    <td className="wrap">
                      <code>{r.text}</code>
                      {r.note && <span className="note"> {r.note}</span>}
                    </td>
                    <td>{r.cls ? CLASS_INFO[r.cls].short : 'context or symptom'}</td>
                    <td>{runbook ? <RunbookLinks r={runbook} short /> : (r.row ?? '')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {(v.sub === 'ambiguous' || v.sub === 'unattributed') && (
            <p data-testid="diag-settle">
              The next checks:{' '}
              {settle.length > 0 ? (
                <>
                  the first 5 minutes of{' '}
                  {settle.map((r, i) => (
                    <span key={r.id}>
                      {i > 0 ? ', ' : ''}
                      <RunbookLinks r={r} short />
                    </span>
                  ))}
                  .
                </>
              ) : (
                'the pod events and the node conditions (the failure taxonomy of the workloads).'
              )}
            </p>
          )}
          <dl className="lifecycle-detail diag-card" data-testid="diag-card">
            <dt>terminal_state</dt>
            <dd data-testid="diag-terminal">{v.terminal ?? 'no state change'}</dd>
            <dt>sub_domain</dt>
            <dd>{SUB_LABEL[v.sub]}</dd>
            <dt>failure class</dt>
            <dd>{v.cls ? CLASS_INFO[v.cls].label : 'none: the evidence does not name one'}</dd>
            <dt>responsible node</dt>
            <dd>{v.node ?? 'none'}</dd>
            <dt>confidence</dt>
            <dd>
              {v.confidence} ({v.votes.hardware} hardware, {v.votes.system_software} system software)
            </dd>
          </dl>
          <p data-testid="diag-why">{v.why}</p>
          <p className="note">
            The events are examples of a class, and each one cites the line of its signal or its rule. {VERDICT_RULE} The Explorer does not probe the hardware: this is machine-assisted diagnosis.
          </p>
          <p className="note" data-testid="diag-note">
            The model, not the repository: {DIAG_CLASS_NOTE.value} <span className={`status ${DIAG_CLASS_NOTE.status}`}>{DIAG_CLASS_NOTE.status}</span> ({DIAG_CLASS_NOTE.note})
          </p>
        </>
      )}
    </section>
  )
}
