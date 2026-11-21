import { PAR_FACTS } from '../catalog/parallel'
import { platformFor } from '../catalog/platforms'
import { DIMS, DIM_LABEL, DIM_NAME, NET_LABEL, groupIndexes, groupNetwork, groupsOf, planProblem, rankGpus } from '../parallel/plan'
import { useApp } from '../state/store'
import { Badge } from './CollPanel'

// The inspector of the Parallelism view: for each dimension, the groups, the size, the collective, and the network of
// the group of the selected GPU (rank 0 when no GPU is selected); the lesson; and the failed GPUs of Simulate mode.
export function ParTable() {
  const { coll, config, failures } = useApp()
  if (!coll) return null
  const par = coll.par
  const unit = platformFor(config).form === 'nvl72-tray' ? 'trays' : 'servers'
  const problem = planProblem(config, par)
  const gpus = problem ? null : rankGpus(config, par)
  const cell = par.cell ?? 0
  const down = gpus ? gpus.flatMap((id, r) => (failures.some((f) => f.id === id) ? [{ id, r }] : [])) : []
  const notes = [PAR_FACTS.order, PAR_FACTS.rankOrder, PAR_FACTS.epRule]
  return (
    <section className="panel" data-testid="par-info">
      <h2>
        Parallelism, {par.servers} {unit}
      </h2>
      {gpus ? (
        <>
          <table className="par-table" data-testid="par-table">
            <thead>
              <tr>
                <th>Dimension</th>
                <th>Groups</th>
                <th>Size</th>
                <th>Collective</th>
                <th>Network (group of rank {cell})</th>
              </tr>
            </thead>
            <tbody>
              {DIMS.map((d) => {
                const groups = groupsOf(par, gpus.length, d)
                const mine = groups.find((m) => m.includes(cell))!
                return (
                  <tr key={d} data-dim={d}>
                    <th scope="row">
                      {DIM_LABEL[d]} ({DIM_NAME[d]})
                    </th>
                    <td>{groups.length}</td>
                    <td>{mine.length}</td>
                    <td>
                      {PAR_FACTS.collective[d].value} <Badge f={PAR_FACTS.collective[d]} />
                    </td>
                    <td>{NET_LABEL[groupNetwork(config, mine.map((r) => gpus[r]!))]}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p data-testid="par-lesson">
            <strong>{PAR_FACTS.lesson.value.charAt(0).toUpperCase() + PAR_FACTS.lesson.value.slice(1)}.</strong> <Badge f={PAR_FACTS.lesson} /> {PAR_FACTS.lesson.note}
          </p>
          {down.length > 0 && (
            <div data-testid="par-failures">
              <ul className="marks">
                {down.map(({ id, r }) => {
                  const gi = groupIndexes(par, gpus.length, r)
                  return (
                    <li key={id} className="bad">
                      {id} (rank {r}) failed: it is in {DIMS.map((d) => `${DIM_LABEL[d]} group ${gi[d]}`).join(', ')}.
                    </li>
                  )
                })}
              </ul>
              <p>
                {PAR_FACTS.failure.value}. <Badge f={PAR_FACTS.failure} /> {PAR_FACTS.failure.note}
              </p>
            </div>
          )}
        </>
      ) : (
        <p>{problem}</p>
      )}
      <ul className="notes">
        {notes.map((f) => (
          <li key={f.value}>
            {f.value} <Badge f={f} />
            {f.note && <div>{f.note}</div>}
          </li>
        ))}
      </ul>
    </section>
  )
}
