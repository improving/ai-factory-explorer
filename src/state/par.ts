import { PLAY, gpuCount, groupsOf, planGroup, planProblem, type Dim, type Plan } from '../parallel/plan'
import { fitCell, fitColl, type CollState, type ParState } from './coll'
import type { AppState } from './transitions'

// The switch of the bar: Collective view or Parallelism view. The plan and the collective stay.
export function setCollView(s: AppState, view: CollState['view']): AppState {
  if (!s.coll || s.coll.view === view) return s
  return { ...s, coll: { ...s.coll, view, pair: null } }
}

// A new size or server count. The selected GPU stays when the plan fits and has it.
// A group of the old plan stays only when the new plan gives it the same GPUs (fitColl).
export function setPlan(s: AppState, patch: Partial<Plan>): AppState {
  if (!s.coll) return s
  const par = { ...s.coll.par, ...patch }
  const next = { ...s.coll, par: { ...par, cell: fitCell(s.config, par) } }
  return { ...s, coll: next.scope === 'group' ? fitColl(s.config, next) : next }
}

export function setParDim(s: AppState, dim: Dim): AppState {
  if (!s.coll || s.coll.par.dim === dim) return s
  return { ...s, coll: { ...s.coll, par: { ...s.coll.par, dim } } }
}

// The selected GPU (a rank of the job); only in a plan that fits. Null clears it.
export function setParCell(s: AppState, cell: number | null): AppState {
  if (!s.coll || cell === s.coll.par.cell) return s
  if (cell !== null && (planProblem(s.config, s.coll.par) || !Number.isInteger(cell) || cell < 0 || cell >= gpuCount(s.config, s.coll.par))) return s
  return { ...s, coll: { ...s.coll, par: { ...s.coll.par, cell } } }
}

// The group of the selected GPU in the selected dimension, and its number.
function pickedGroup(s: { config: AppState['config'] }, par: ParState): { index: number; size: number } | null {
  if (par.cell === null || planProblem(s.config, par)) return null
  const groups = groupsOf(par, gpuCount(s.config, par), par.dim)
  const index = groups.findIndex((g) => g.includes(par.cell!))
  return index < 0 ? null : { index, size: groups[index]!.length }
}

// Why "Play this group" cannot play, or null.
export function playProblem(config: AppState['config'], par: ParState): string | null {
  const g = pickedGroup({ config }, par)
  if (!g) return 'Click a GPU in the grid to select its group.'
  if (!PLAY[par.dim]) return 'PP is send and receive between neighbour stages; Collective view has no model of it.'
  if (g.size < 2) return 'This group has 1 GPU: it sends nothing.'
  return null
}

// "Play this group": Collective view with the group of the selected GPU and the collective of its dimension.
export function playGroup(s: AppState): AppState {
  const c = s.coll
  if (!c || playProblem(s.config, c.par)) return s
  const group = planGroup(s.config, c.par, c.par.dim, pickedGroup(s, c.par)!.index)
  if (!group) return s
  return { ...s, coll: { ...c, view: 'collective', ...PLAY[c.par.dim]!, scope: 'group', group, step: 0, channel: 0, pair: null } }
}
