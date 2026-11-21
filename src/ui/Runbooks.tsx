import type { Fact } from '../catalog/fact'
import type { Runbook } from '../catalog/runbooks'
import { SourceRef } from './SourceRef'

// A written runbook: its title (the document), and section 3 "First 5 minutes" (the read-only steps of L1),
// by the line of that section in the runbook. Both open the reader, and not a tab.
// `short` shows only the id (a narrow table cell); the title is then the tooltip.
export function RunbookLinks({ r, short = false }: { r: Runbook; short?: boolean }) {
  return (
    <>
      <SourceRef source={r.top.source} title={short ? r.top.label : undefined}>
        {short ? r.id : r.top.label}
      </SourceRef>{' '}
      (<SourceRef source={r.first5.source}>First 5 minutes</SourceRef>)
    </>
  )
}

// The written runbooks of a part; `why` marks the runbooks that no catalogue row names (assumed).
export function WrittenRunbooks({ runbooks, why }: { runbooks: Runbook[]; why?: Fact<string> }) {
  if (runbooks.length === 0) return null
  return (
    <div data-testid="written-runbooks">
      <h3>Written runbooks</h3>
      <ul>
        {runbooks.map((r) => (
          <li key={r.id}>
            <RunbookLinks r={r} />
          </li>
        ))}
      </ul>
      {why && (
        <p className="muted">
          {why.value}: <span className={`status ${why.status}`}>{why.status}</span> ({why.note})
        </p>
      )}
    </div>
  )
}
