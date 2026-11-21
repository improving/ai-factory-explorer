import { buffersAt, changedAt, countOf, showsSource, sourceOf, type Schedule } from '../collectives/schedule'
import { railColor } from '../views/palette'

// The buffers: one row for each rank, one column for each chunk. A cell shows how many ranks it holds (its fill is that
// part), or, for AlltoAll and Broadcast, the rank whose data it holds. A cell that the current step writes has an outline.
export function BufferStrip({ sc, step }: { sc: Schedule; step: number }) {
  const n = sc.ranks.length
  const source = showsSource(sc.collective)
  const b = buffersAt(sc, step)
  const changed = changedAt(sc, step)
  return (
    <details className="portmap buffers" open data-testid="buffer-strip">
      <summary>
        Buffers: {n} ranks × {sc.chunks} chunks · {source ? 'each cell names the rank whose data it holds' : 'each cell shows how many ranks it holds'}
        {sc.algorithm === 'tree' ? ' · chunk 0 goes on tree 1, chunk 1 on tree 2' : ''}
      </summary>
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            {Array.from({ length: sc.chunks }, (_, c) => (
              <th key={c}>Chunk {c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {b.map((row, r) => (
            <tr key={r}>
              <th title={sc.ranks[r]}>{r}</th>
              {row.map((mask, c) => {
                const k = countOf(mask)
                const src = k > 0 ? sourceOf(mask) : -1
                const colour = railColor(source && sc.collective === 'alltoall' ? src : c)
                const fill = source ? (k > 0 ? 100 : 0) : (k / n) * 100
                return (
                  <td key={c} data-testid={`cell-${r}-${c}`} data-count={k} className={changed.has(`${r}:${c}`) ? 'changed' : undefined} style={{ '--chunk': colour, '--fill': `${fill}%` } as React.CSSProperties}>
                    {k > 0 && <span>{source ? `r${src}` : `${k}/${n}`}</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
