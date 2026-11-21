import { BASELINE_GATE, FIRMWARE_BY_ID } from '../catalog/firmware'
import { CLASSIFICATION_BY_ID, MAINTENANCE_CLASSES, SEVERITIES, verdictOf, type ClassificationId } from '../catalog/health'
import { LIFECYCLE, LIFECYCLE_BY_ID, LIFECYCLE_MAP_NOTE, lifecycleOf } from '../catalog/lifecycle'
import { useMemo } from 'react'
import { useApp } from '../state/store'
import { SPAN, WINDOW_LABEL, WINDOW_MIN, atOf, clockOf, hostEvents, type TelEvent } from '../telemetry/events'
import type { HostAt } from '../telemetry/replay'
import { assignments } from '../topology/assign'
import { firmwareOf, fleetFirmware } from '../telemetry/firmware'
import { SourceRef } from './SourceRef'

const RB12 = 'runbooks/RB-12-host-not-allocatable-lifecycle.md'
const LAB_HEALTH = 'handson/18-health-validation/README.md'
const M2_VERDICT = 'runbooks/RB-12-host-not-allocatable-lifecycle.md:18'

function Classes({ ids }: { ids: ClassificationId[] }) {
  return (
    <ul className="classes">
      {ids.map((id) => {
        const c = CLASSIFICATION_BY_ID.get(id)
        if (!c) return null
        return (
          <li key={id}>
            <SourceRef source={c.source}>{c.label}</SourceRef>: {c.effect}
          </li>
        )
      })}
    </ul>
  )
}

// The Lifecycle tab: the current NICo state of a host, its health verdict, the gate of each state, and, with the
// time view on, the events of the window that led to the state at the cursor.
export function LifecyclePanel({ events, at }: { events: TelEvent[]; at: Map<string, HostAt> | null }) {
  const { config, selected, time } = useApp()
  const a = selected ? assignments(config).get(selected) : undefined
  if (!a) {
    return (
      <div data-testid="lifecycle-panel">
        <p>A host lifecycle applies to a server or a tray. Select one on the canvas.</p>
      </div>
    )
  }
  // The state at the cursor of the time view, or the state of today.
  const state = at?.get(selected!)?.state ?? a.state
  const current = lifecycleOf(state)
  const step = LIFECYCLE_BY_ID.get(current)!
  const verdict = verdictOf(state)
  const from = time ? SPAN - WINDOW_MIN[time.window] : 0
  const cursor = time ? atOf(time.window, time.cursor) : 0
  const own = time ? hostEvents(events, selected!).filter((e) => e.at >= from) : []
  const later = own.filter((e) => e.at > cursor).length
  const fw = firmwareOf(selected!)
  const fleet = useMemo(() => fleetFirmware(config), [config])
  const behindLabel = fw.behind === null ? null : FIRMWARE_BY_ID.get(fw.behind)!.label
  const severity = verdict ? SEVERITIES.find((s) => s.id === verdict.severity)! : null
  return (
    <div data-testid="lifecycle-panel">
      <h3 data-testid="lifecycle-state">
        {step.label}
        <span className="note"> · {step.phase}</span>
      </h3>
      <p className="summary">{step.meaning}</p>
      <dl className="lifecycle-detail">
        <dt>Entry</dt>
        <dd>{step.entry}</dd>
        <dt>Exit</dt>
        <dd>{step.exit}</dd>
        <dt>Evidence</dt>
        <dd>{step.evidence}</dd>
      </dl>

      {time && (
        <>
          <h3>The last {WINDOW_LABEL[time.window]}</h3>
          <p className="note" data-testid="lifecycle-at">
            At {clockOf(cursor)}: {state}. {own.length} events in the window, and {later} of them are later.
            {at?.get(selected!) ? ` ${at.get(selected!)!.xids} Xid, ${at.get(selected!)!.flaps} link flaps, and ${at.get(selected!)!.throttles} throttles up to this minute.` : ''}
          </p>
          {own.length > 0 ? (
            <table className="specs history" data-testid="lifecycle-history">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {own.map((e) => (
                  <tr key={`${e.at}-${e.kind}-${e.note}`} className={e.at > cursor ? 'later' : undefined}>
                    <th>{clockOf(e.at)}</th>
                    <td>{e.note}</td>
                    <td>{e.to ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="note">No event in the window: the host kept its state.</p>
          )}
        </>
      )}

      <h3>Health verdict</h3>
      {verdict && severity ? (
        <>
          <p data-testid="verdict-severity">
            <span className={`status ${verdict.fact.status}`} title={verdict.fact.note}>
              {severity.id}
            </span>{' '}
            {severity.meaning}
          </p>
          <p>{severity.action}</p>
          <p className="note">
            Probe: {verdict.probe}. {verdict.note}
          </p>
          <Classes ids={verdict.classes} />
          <p className="note">{verdict.fact.note}</p>
        </>
      ) : (
        <>
          <p data-testid="verdict-severity">No health verdict: an operator set maintenance.</p>
          <Classes ids={MAINTENANCE_CLASSES} />
          <p className="note">Maintenance sets these three classifications automatically, so the state-machine SLA does not page on-call for work that an operator is doing.</p>
        </>
      )}

      <h3>The firmware baseline</h3>
      <p className="note" data-testid="firmware-summary">
        {behindLabel === null ? 'The host matches the baseline on every component.' : `The host is behind the baseline on the ${behindLabel.toLowerCase()}.`} A host that cannot reach the baseline is quarantined, and it leaves the pool.
      </p>
      <table className="specs firmware" data-testid="firmware-host">
        <thead>
          <tr>
            <th>Component</th>
            <th>Expected</th>
            <th>Actual</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {fw.rows.map((r) => {
            const c = FIRMWARE_BY_ID.get(r.id)!
            return (
              <tr key={r.id} className={r.ok ? undefined : 'behind'} data-testid={`firmware-${r.id}`}>
                <th title={c.where}>{c.label}</th>
                <td>
                  {c.expected.value} <span className={`status ${c.expected.status}`} title={c.expected.note}>{c.expected.status}</span>
                </td>
                <td>{r.actual}</td>
                <td>{r.ok ? 'match' : 'behind'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="note">
        {fleet.behind.length} of the {fleet.hosts} hosts are behind the baseline. The fleet, by component:
      </p>
      <table className="specs firmware" data-testid="firmware-fleet">
        <thead>
          <tr>
            <th>Component</th>
            <th>Expected</th>
            <th>Hosts behind</th>
          </tr>
        </thead>
        <tbody>
          {fleet.byComponent.map((c) => {
            const comp = FIRMWARE_BY_ID.get(c.id)!
            return (
              <tr key={c.id} className={c.hosts.length === 0 ? undefined : 'behind'} data-testid={`fleet-firmware-${c.id}`}>
                <th title={comp.where}>{comp.label}</th>
                <td>{comp.expected.value}</td>
                <td>{c.hosts.length === 0 ? 'none' : `${c.hosts.length}: ${c.hosts.slice(0, 3).join(', ')}${c.hosts.length > 3 ? ', and others' : ''}`}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="note" data-testid="firmware-model">
        {BASELINE_GATE.note}
      </p>

      <h3>The states</h3>
      <table className="specs lifecycle">
        <thead>
          <tr>
            <th>State</th>
            <th>Gate</th>
          </tr>
        </thead>
        <tbody>
          {LIFECYCLE.map((s) => (
            <tr key={s.id} aria-current={s.id === current ? 'step' : undefined} className={s.id === current ? 'current' : undefined}>
              <th>
                {s.label}
                <div className="note">{s.phase}</div>
              </th>
              <td>{s.gate}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">{LIFECYCLE_MAP_NOTE}</p>
      <p className="note">
        Sources: <SourceRef source={step.source}>the lifecycle block</SourceRef>; <SourceRef source={M2_VERDICT}>the verdict block</SourceRef>;{' '}
        <SourceRef source={RB12}>RB-12</SourceRef>; <SourceRef source={LAB_HEALTH}>the health validation lab</SourceRef>.
      </p>
    </div>
  )
}
