import { useState } from 'react'
import { DRAIN_COMMANDS, DRAIN_LABEL, SIM_FACTS } from '../catalog/failures'
import { formatFact } from '../catalog/fact'
import { writtenFor } from '../catalog/runbooks'
import { EFFECT_LABEL, type GpuEffect, type Impact } from '../simulate/impact'
import { useApp } from '../state/store'
import { repair, select } from '../state/transitions'
import { rowKeys } from './rowKeys'
import { RunbookLinks } from './Runbooks'
import { SourceRef } from './SourceRef'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const link = (r: { label: string; source: string }) => (
  <SourceRef source={r.source}>
    <code>{r.label}</code>
  </SourceRef>
)

// The impact of the failures (spec 7.3): affected, capacity, severity, the incidents and their alerts, and the first action.
export function ImpactPanel({ impact }: { impact: Impact }) {
  const { set } = useApp()
  const [hours, setHours] = useState(1)
  const effects = (Object.entries(impact.counts) as [GpuEffect, number][]).filter(([, n]) => n > 0)
  return (
    <details className="portmap impact" open data-testid="impact">
      <summary>
        Impact: P{impact.severity.level} · {plural(impact.affected, 'GPU')} out ({impact.affectedPct.toFixed(1)} %) · {plural(impact.alertCount, 'alert')} → {plural(impact.incidents.length, 'incident')}
      </summary>
      <table className="specs">
        <tbody>
          <tr>
            <th>Affected</th>
            <td>
              {effects.length === 0 ? 'no GPU' : effects.map(([e, n]) => `${n} ${EFFECT_LABEL[e]}`).join(', ')}; {plural(impact.nodes.length, 'node')}, {plural(impact.racks, 'rack')}, {plural(impact.sus, 'SU')}
              {impact.tenants.length > 0 ? `; tenants: ${impact.tenants.join(', ')}` : ''}
              {impact.services.length > 0 ? `; services: ${impact.services.join('; ')}` : ''}
            </td>
          </tr>
          <tr>
            <th>Capacity</th>
            <td>
              {impact.available} of {impact.total} GPUs available ({impact.availablePct.toFixed(1)} %); the largest usable pool: {impact.largestPool} {impact.poolUnit} ({link({ label: 'keep the largest pool', source: SIM_FACTS.pool.source! })}
              ); lost GPU hours for{' '}
              <input type="number" min={0} step={1} value={hours} data-testid="impact-hours" onChange={(e) => setHours(Math.max(0, Number(e.target.value) || 0))} /> hours: {impact.affected * hours} (
              {link({ label: 'the formula', source: SIM_FACTS.lostHours.source! })})
            </td>
          </tr>
          <tr>
            <th>Severity</th>
            <td>
              P{impact.severity.level}: {impact.severity.why} ({link({ label: 'the P1 to P4 table', source: SIM_FACTS.p1.source! })})
            </td>
          </tr>
        </tbody>
      </table>
      <table>
        <thead>
          <tr>
            <th>Incident</th>
            <th>Effect</th>
            <th>Alerts</th>
            <th>First action</th>
            <th>Who</th>
            <th>Drain</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {impact.incidents.map((i) => (
            <tr key={i.failure.id} onClick={() => set((s) => select(s, i.failure.id))} {...rowKeys(() => set((s) => select(s, i.failure.id)))}>
              <td>
                {i.label}: {i.failure.id}
              </td>
              <td title={i.rule.effect.note ?? ''}>
                {formatFact(i.rule.effect)} <span className={`status ${i.rule.effect.status}`}>{i.rule.effect.status}</span> {i.rule.effect.source && link({ label: 'source', source: i.rule.effect.source })}
              </td>
              <td title={i.alerts.slice(0, 20).join('\n')}>{plural(i.alerts.length, 'alert')} → 1 incident</td>
              <td>
                {link(i.rule.command)}
                {i.rule.runbook && (
                  <>
                    ; {link(i.rule.runbook)}
                    {writtenFor([i.rule.runbook]).map((r) => (
                      <span key={r.id}>
                        {' → '}
                        <RunbookLinks r={r} />
                      </span>
                    ))}
                  </>
                )}
              </td>
              <td>{formatFact(i.who)}</td>
              <td>
                {DRAIN_LABEL[i.rule.drain]}
                {i.rule.drain !== 'none' && <> ({link(DRAIN_COMMANDS[0]!)})</>}
              </td>
              <td>
                <button type="button" onClick={(e) => (e.stopPropagation(), set((s) => repair(s, i.failure.id)))}>
                  Repair
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        {SIM_FACTS.incident.value} ({link({ label: 'source', source: SIM_FACTS.incident.source! })}). The alert names are the app's; the repository gives the signals, not the alert rules.
      </p>
    </details>
  )
}
