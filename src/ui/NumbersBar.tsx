import type { Numbers } from '../topology/numbers'
import { RAIL_COLORS } from '../views/palette'

export function NumbersBar({ numbers: n }: { numbers: Numbers }) {
  const rack = n.matchesRa === null
  const checks = n.checks.map((c) => `${c.label}: RA ${c.ra}, app ${c.app}`).join('\n')
  return (
    <div className="numbers" data-testid="numbers">
      <span className="design" title={n.design.name}>
        <b>{n.design.short}</b>
      </span>
      <span>{rack ? '1 rack' : `${n.sus} SU`}</span>
      <span>
        {n.servers} {n.serverWord}
      </span>
      <span>{n.gpus} GPUs</span>
      {n.spares > 0 && (
        <span>
          + {n.spares} spare {n.serverWord}
        </span>
      )}
      {!rack && (
        <>
          <span>{n.leaves} leaves</span>
          <span>{n.spines} spines</span>
          <span>{n.nodeLeafCables} node-leaf cables</span>
          <span>{n.leafSpineCables} leaf-spine cables</span>
          {n.bisection && (
            <span title={`${n.bisection.formula ?? n.bisection.note ?? ''} (${n.bisection.status})`.trim()}>{n.bisection.value} Tb/s bisection</span>
          )}
        </>
      )}
      {rack ? (
        <span className="note">one rack, no scale-out fabric</span>
      ) : (
        <span className={n.matchesRa ? 'ok' : 'bad'} title={checks}>
          {n.matchesRa ? (n.wiringAssumed ? '✓ RA counts, assumed wiring' : '✓ RA') : '✗ not the RA'}
        </span>
      )}
      {n.notes.map((note) => (
        <span key={note} className="warn" title={note}>
          ⚠ {note}
        </span>
      ))}
      {!rack && (
        <span className="legend" aria-label="Rail colours">
          Rails
          {RAIL_COLORS.slice(0, n.design.rails.value).map((c, k) => (
            <span key={c} className="chip" style={{ borderColor: c }} title={`rail ${k}`}>
              {k}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}
