import { platformFor } from '../catalog/platforms'
import { DIMS, DIM_LABEL, gpuCount, groupsOf, jobSizes, planProblem, rankGpus, sizeChoices } from '../parallel/plan'
import { playGroup, playProblem, setParCell, setParDim, setPlan } from '../state/par'
import { useApp } from '../state/store'
import { railColor } from '../views/palette'

// The Parallelism view (the bottom panel of Collectives mode): the plan of the job, the dimensions, and the grid of
// the GPUs (one row for each server). A click on a GPU selects its group of the selected dimension.
export function ParPanel() {
  const { coll, config, failures, set } = useApp()
  if (!coll) return null
  const par = coll.par
  const p = platformFor(config)
  const g = p.gpusPerServer.value
  const unit = p.form === 'nvl72-tray' ? 'Trays' : 'Servers'
  const total = gpuCount(config, par)
  const sizes = jobSizes(config)
  const problem = planProblem(config, par)
  const gpus = problem ? null : rankGpus(config, par)
  const groups = gpus ? groupsOf(par, total, par.dim) : []
  const groupOf = new Map<number, number>()
  groups.forEach((m, i) => m.forEach((r) => groupOf.set(r, i)))
  const picked = par.cell !== null ? (groups[groupOf.get(par.cell) ?? -1] ?? []) : []
  const failed = new Set(failures.map((f) => f.id))
  const why = playProblem(config, par)
  return (
    <section className="portmap par" data-testid="par-panel" aria-label="Parallelism plan">
      <div className="par-controls">
        <label>
          {unit}{' '}
          <select data-testid="par-servers" value={par.servers} onChange={(e) => set((s) => setPlan(s, { servers: Number(e.target.value) }))}>
            {[...sizes, ...(sizes.includes(par.servers) ? [] : [par.servers])].map((n) => (
              <option key={n} value={n} disabled={!sizes.includes(n)}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {DIMS.map((d) => (
          <label key={d}>
            {DIM_LABEL[d]}{' '}
            <select data-testid={`par-${d}`} value={par[d]} onChange={(e) => set((s) => setPlan(s, { [d]: Number(e.target.value) }))}>
              {[...new Set([...sizeChoices(total), par[d]])].sort((a, b) => a - b).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ))}
        <span className="muted">
          {total} GPUs; TP × CP × DP × PP = {total}; EP divides DP × CP
        </span>
      </div>
      {problem || !gpus ? (
        <p className="bad" data-testid="par-problem">
          {problem}
        </p>
      ) : (
        <>
          <div className="par-dims">
            <span className="modes" role="group" aria-label="Dimension">
              {DIMS.map((d) => (
                <button key={d} type="button" aria-pressed={par.dim === d} data-testid={`par-dim-${d}`} onClick={() => set((s) => setParDim(s, d))}>
                  {DIM_LABEL[d]}
                </button>
              ))}
            </span>
            <button type="button" data-testid="par-play" disabled={why !== null} onClick={() => set((s) => playGroup(s))}>
              Play this group
            </button>
            {why && (
              <span className="muted" data-testid="par-play-note">
                {why}
              </span>
            )}
          </div>
          <table className="par-grid" data-testid="par-grid">
            <tbody>
              {Array.from({ length: par.servers }, (_, n) => (
                <tr key={n}>
                  <th scope="row">{gpus[n * g]!.split('/')[0]}</th>
                  {Array.from({ length: g }, (_, k) => {
                    const r = n * g + k
                    const gi = groupOf.get(r)!
                    const down = failed.has(gpus[r]!)
                    return (
                      <td key={k}>
                        <button
                          type="button"
                          data-rank={r}
                          className={[picked.includes(r) ? 'in-group' : '', down ? 'failed' : ''].join(' ').trim() || undefined}
                          style={groups.length <= 8 ? { borderTopColor: railColor(gi) } : undefined}
                          title={`${gpus[r]}: rank ${r}, ${DIM_LABEL[par.dim]} group ${gi}${down ? ', failed' : ''}`}
                          aria-pressed={par.cell === r}
                          onClick={() => set((s) => setParCell(s, r))}
                        >
                          {down ? '✕ ' : ''}
                          {DIM_LABEL[par.dim]} {gi}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
