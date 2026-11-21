import type { DocRef } from '../catalog/component-docs'
import { formatFact } from '../catalog/fact'
import { useApp } from '../state/store'
import { TABS, tabIdsFor } from '../state/tabs'
import { isHost } from '../catalog/lifecycle'
import { fail, groupSu, openFabric, openRack, openRacks, openServer, repair, setTab, toggleSu, type AppState } from '../state/transitions'
import { FAIL_RULES, type FailMode } from '../catalog/failures'
import { PART_RUNBOOKS, writtenFor } from '../catalog/runbooks'
import { failKind, validFailure } from '../simulate/failable'
import { suOf } from '../topology/ids'
import { rackOf } from '../topology/racks'
import type { Graph } from '../topology/graph'
import { inspect, provenanceOf, type SpecRow } from './inspect'
import { WrittenRunbooks } from './Runbooks'
import { ownerToolRows } from './ownerTool'
import { CollPanel } from './CollPanel'
import { ChecklistPanel } from './ChecklistPanel'
import { LifecyclePanel } from './LifecyclePanel'
import { ParTable } from './ParTable'
import type { TelEvent } from '../telemetry/events'
import type { HostAt } from '../telemetry/replay'
import { SourceRef } from './SourceRef'

function Ref({ r }: { r: DocRef }) {
  return <SourceRef source={r.source}>{r.label}</SourceRef>
}

function RefList({ title, refs, code = false }: { title: string; refs: DocRef[]; code?: boolean }) {
  if (refs.length === 0) return null
  return (
    <>
      <h3>{title}</h3>
      <ul>
        {refs.map((r) => (
          <li key={r.label}>
            {code ? (
              <>
                <code>{r.label}</code> (
                <SourceRef source={r.source} name={`Open the source in the Library: ${r.label}`}>
                  source
                </SourceRef>
                )
              </>
            ) : (
              <Ref r={r} />
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function Specs({ rows }: { rows: SpecRow[] }) {
  if (rows.length === 0) return <p>No specs for this part.</p>
  const p = provenanceOf(rows)
  return (
    <>
    <p className="note" data-testid="provenance-line">
      Provenance: {p.confirmed} confirmed, {p.derived} derived, and {p.unconfirmed.length} that no source confirms.
    </p>
    <table className="specs">
      <tbody>
        {rows.map(({ label, fact }) => (
          <tr key={label}>
            <th>{label}</th>
            <td>{formatFact(fact)}</td>
            <td>
              {/* The badge is the link to the source, so the row does not wrap. */}
              {fact.source ? (
                <SourceRef className={`status ${fact.status}`} source={fact.source} title={(fact.formula ?? fact.note ?? '').trim() || undefined} name={`Open the source of this value in the Library: ${fact.status}`}>
                  {fact.status}
                </SourceRef>
              ) : (
                <span className={`status ${fact.status}`} title={fact.formula ?? fact.note ?? ''}>
                  {fact.status}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <Provenance rows={rows} />
    </>
  )
}

// The provenance of the facts of the part: how many a source confirms, how many are derived, and the ones that
// no source confirms, with the note that says what the value depends on.
function Provenance({ rows }: { rows: SpecRow[] }) {
  const p = provenanceOf(rows)
  if (p.unconfirmed.length === 0) return null
  return (
    <div data-testid="provenance">
      <p className="note">A confirmed value would replace each of these, and its badge.</p>
      <ul className="unconfirmed">
        {p.unconfirmed.map((r) => (
          <li key={r.label}>
            <strong>{r.label}</strong>: {formatFact(r.fact)} <span className={`status ${r.fact.status}`}>{r.fact.status}</span>
            {r.fact.note && <span className="note"> ({r.fact.note})</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Inspector({ fabric, server, overview, racks, events, at }: { fabric: Graph; server: Graph | null; overview: Graph; racks: Graph | null; events: TelEvent[]; at: Map<string, HostAt> | null }) {
  const { selected, config, view, mode, coll, diag, tab, set } = useApp()
  const ids = tabIdsFor(isHost(config, selected))
  const active = ids.includes(tab) ? tab : ids[0]! // a link can name a tab that this part does not have
  // Simulate mode: the checklist of the runbook that the diagnosis opened takes the inspector.
  if (mode === 'simulate' && diag.checklist !== null) return <ChecklistPanel />
  const info = selected ? inspect(selected, { config, fabric, server, overview, racks }) : null
  if (!info) {
    if (mode === 'collectives') return coll?.view === 'parallelism' ? <ParTable /> : <CollPanel />
    return (
      <section className="panel">
        <h2>Inspector</h2>
        <p>Click a part on the canvas to see its specs, its failure signals, and what to read.</p>
      </section>
    )
  }
  return (
    <section className="panel">
      <h2 data-testid="inspector-title">{info.title}</h2>
      <OpenButton id={info.id} kind={info.kind} overview={overview} />
      <p className="summary">{info.summary}</p>
      <FailButtons id={info.id} />
      {info.kind === 'su' && view.level === 'fabric' && (
        <button type="button" data-testid="show-racks" onClick={() => set((s) => openRacks(s, suOf(info.id)!))}>
          Show the racks of this SU
        </button>
      )}
      {info.kind === 'rack' && view.level === 'racks' && rackOf(config, info.id)?.role !== 'cdu' && (
        <button type="button" data-testid="show-ports" onClick={() => set((s) => openRack(s, info.id))}>
          Show the ports and the port map
        </button>
      )}
      <div
        role="tablist"
        className="tabs"
        onKeyDown={(e) => {
          // The arrow keys, Home, and End move to another tab (one tab stop: the selected tab).
          const at = ids.indexOf(active)
          const to = e.key === 'ArrowRight' ? (at + 1) % ids.length : e.key === 'ArrowLeft' ? (at - 1 + ids.length) % ids.length : e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : -1
          if (to < 0) return
          e.preventDefault()
          e.stopPropagation() // the window handler steps the trace hop with the arrow keys
          set((s) => setTab(s, ids[to]!))
          document.getElementById(`tab-${ids[to]}`)?.focus()
        }}
      >
        {TABS.filter(([id]) => ids.includes(id)).map(([id, label]) => (
          <button key={id} id={`tab-${id}`} type="button" role="tab" aria-selected={active === id} aria-controls="tabpanel" tabIndex={active === id ? 0 : -1} onClick={() => set((s) => setTab(s, id))}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${active}`}>
      {active === 'specs' && <Specs rows={info.specs} />}
      {active === 'signals' && (
        <>
          <RefList title="Failure signals" refs={info.doc.signals} />
          <RefList title="Check commands" refs={info.doc.commands} code />
          {info.doc.blastRadius && <RefList title="Blast radius" refs={[info.doc.blastRadius]} />}
        </>
      )}
      {active === 'learn' && (
        <>
          <RefList title="Read and practise" refs={info.doc.learn} />
          <RefList title="Runbooks" refs={info.doc.runbooks} />
          <WrittenRunbooks runbooks={writtenFor(info.doc.runbooks, PART_RUNBOOKS[info.kind]?.ids)} why={PART_RUNBOOKS[info.kind]?.why} />
        </>
      )}
      {active === 'owner' && <Specs rows={ownerToolRows(config, info)} />}
      {active === 'lifecycle' && <LifecyclePanel events={events} at={at} />}
      </div>
    </section>
  )
}

// Simulate mode: Fail (one button for each mode of the part) and Repair.
function FailButtons({ id }: { id: string }) {
  const { mode, config, failures, set } = useApp()
  if (mode !== 'simulate') return null
  const kind = failKind(config, id)
  if (!kind) return null
  const now = failures.find((f) => f.id === id)
  return (
    <div className="failbar" data-testid="failbar">
      {(Object.entries(FAIL_RULES[kind].modes) as [FailMode, { label: string }][]).filter(([m]) => validFailure(config, { id, mode: m })).map(([m, r]) => (
        <button key={m} type="button" data-testid={`fail-${m}`} aria-pressed={now?.mode === m} onClick={() => set((s) => fail(s, id, m))}>
          Fail: {r.label}
        </button>
      ))}
      {now && (
        <button type="button" data-testid="repair" onClick={() => set((s) => repair(s, id))}>
          Repair
        </button>
      )}
    </div>
  )
}

// Open: the same action as a double-click on the part (a server, an SU group, the pods or the compute fabric block).
function OpenButton({ id, kind, overview }: { id: string; kind: string; overview: Graph }) {
  const { config, expanded, set } = useApp()
  const role = kind === 'block' ? overview.nodes.find((n) => n.id === id)?.role : undefined
  const su = kind === 'su' ? suOf(id) : null
  const [label, act] =
    kind === 'server'
      ? ['Open the server', (s: AppState) => openServer(s, id)]
      : su !== null
        ? [expanded.has(groupSu(config, su)) ? 'Close the group' : 'Open the group', (s: AppState) => toggleSu(s, su)]
        : role === 'pods' || role === 'compute-fabric'
          ? ['Open the fabric', openFabric]
          : [null, null]
  if (!label || !act) return null
  return (
    <button type="button" data-testid="open-part" onClick={() => set(act)}>
      {label}
    </button>
  )
}
