import { useEffect, useMemo } from 'react'
import { PIX_NOTE, TOPO_CODES } from '../catalog/topoCodes'
import { platformFor } from '../catalog/platforms'
import { useHighlight } from '../state/highlight'
import { useApp } from '../state/store'
import { select, toggleRail } from '../state/transitions'
import { topoMatrix, type TopoCell } from '../topology/topo'
import { SourceRef } from './SourceRef'

const MARK: Record<string, string> = { assumed: '*', 'not-sourced': '' }

// The nvidia-smi topo -m matrix of the open server (M1 lab: map each GPU to its NIC). A cell click
// lights its two parts on the canvas.
export function TopoMatrix({ serverId }: { serverId: string }) {
  const { config, set } = useApp()
  const { pair, setPair } = useHighlight()
  const m = useMemo(() => topoMatrix(config, serverId), [config, serverId])
  // The highlight belongs to this panel: it goes when the panel goes, or when the matrix changes.
  useEffect(() => () => setPair([]), [m, setPair])
  if (!m) return null
  const P = platformFor(config)
  const on = (c: TopoCell) => pair[0] === c.a && pair[1] === c.b
  return (
    <details className="portmap topo" open data-testid="topo">
      <summary>nvidia-smi topo -m: the GPU and NIC affinity of {serverId}</summary>
      <table>
        <thead>
          <tr>
            <th />
            {m.heads.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {m.rows.map((r) => (
            <tr key={r.id}>
              <th>{r.head}</th>
              {r.cells.map((c, k) => (
                <td
                  key={c.b}
                  data-testid={`topo-${r.head}-${m.heads[k]}`}
                  className={`${c.status}${on(c) ? ' on' : ''}`}
                  title={`${r.head} to ${m.heads[k]}: ${c.text} (${c.status})`}
                  onClick={() => {
                    if (on(c) || c.a === c.b) return setPair([])
                    // The pair replaces the selection and the rail highlight, so its two parts are not faded.
                    set((s) => {
                      const t = select(s, null)
                      return t.rail === null ? t : toggleRail(t, t.rail)
                    })
                    setPair([c.a, c.b])
                  }}
                >
                  {c.text}
                  {MARK[c.status] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        * assumed. {PIX_NOTE.note} NUMA: {P.numaGpus.note ?? 'from the platform facts'}
        {P.nvlinkLinksPerGpu.value === null ? ` NV?: ${P.nvlinkLinksPerGpu.note}` : ''}
      </p>
      {m.nicNames.length > 0 && <p className="note">NIC legend: {m.nicNames.join(', ')}</p>}
      <p className="note">
        {TOPO_CODES.map((t) => `${t.code} = ${t.fact.value}`).join('; ')} (
        <SourceRef source={TOPO_CODES[0]!.fact.source!}>nvidia-smi documentation</SourceRef>
        ).
      </p>
    </details>
  )
}
