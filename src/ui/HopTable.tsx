import { formatFact } from '../catalog/fact'
import { LINK_LABEL } from '../catalog/paths'
import { hopRunbook } from '../catalog/runbooks'
import type { Trace } from '../routing/trace'
import { useApp } from '../state/store'
import { stopPlay } from '../state/play'
import { setHop } from '../state/transitions'
import { rowKeys } from './rowKeys'
import { RunbookLinks } from './Runbooks'
import { SourceRef } from './SourceRef'

const PLANES = ['A', 'B']

// The hops of the trace: the link, the bandwidth, the network, the rail, the plane, the command to check on that hop,
// and the written runbook for a fault on that kind of link.
export function HopTable({ trace, hop }: { trace: Trace; hop: number }) {
  const { set } = useApp()
  return (
    <details className="portmap hoptable" open data-testid="hop-table">
      <summary>
        {trace.hops.length} hops · {trace.title}
      </summary>
      <table>
        <thead>
          <tr>
            <th>Hop</th>
            <th>From</th>
            <th>To</th>
            <th>Link</th>
            <th>Runbook</th>
            <th>Bandwidth</th>
            <th>Network</th>
            <th>Rail</th>
            <th>Plane</th>
            <th>Check</th>
          </tr>
        </thead>
        <tbody>
          {trace.hops.map((h, i) => (
            <tr
              key={i}
              data-testid={`hop-row-${i}`}
              className={[i === hop ? 'on' : '', i === trace.bottleneck ? 'bottleneck' : ''].join(' ').trim() || undefined}
              onClick={() => {
                stopPlay() // a manual step stops the play
                set((s) => setHop(s, i))
              }}
              {...rowKeys(() => {
                stopPlay()
                set((s) => setHop(s, i))
              })}
            >
              <td>
                {i + 1}
                {i === trace.bottleneck ? ' (bottleneck)' : ''}
              </td>
              <td>{h.from.label}</td>
              <td>
                {h.to.label}
                {h.fan.length === 0 ? '' : h.link === 'nvlink' ? ` (${h.fan.length + 1} chips in parallel)` : ` (1 of ${h.fan.length + 1})`}
              </td>
              <td>{LINK_LABEL[h.link]}{h.degraded ? ' (degraded: high BER)' : ''}</td>
              <td>
                {(() => {
                  const r = hopRunbook(h)
                  return r ? <RunbookLinks r={r} short /> : '—'
                })()}
              </td>
              <td>
                {formatFact(h.bandwidth)} <span className={`status ${h.bandwidth.status}`} title={h.bandwidth.formula ?? h.bandwidth.note ?? ''}>{h.bandwidth.status}</span>
              </td>
              <td>{h.network}</td>
              <td>{h.rail ?? '—'}</td>
              <td>{h.plane === undefined ? '—' : PLANES[h.plane]}</td>
              <td>
                {h.checks.map((c, k) => (
                  <span key={c.label}>
                    {k > 0 ? '; ' : ''}
                    <SourceRef source={c.source}>
                      <code>{c.label}</code>
                    </SourceRef>
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="notes">
        {trace.notes.map((n) => (
          <li key={n.value}>
            {n.value} (<span className={`status ${n.status}`}>{n.status}</span>
            {n.source && (
              <>
                {', '}
                <SourceRef source={n.source} name="Open the source of this note in the Library">
                  source
                </SourceRef>
              </>
            )}
            )
          </li>
        ))}
      </ul>
    </details>
  )
}
