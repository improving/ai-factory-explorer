import { platformFor } from '../catalog/platforms'
import type { Config } from '../config/config'
import { validAlgorithms } from '../collectives/algorithms'
import { SIZES, type SizeId } from '../collectives/busbw'
import { channelRanks } from '../collectives/channels'
import { pairKey, schedulePairs } from '../collectives/load'
import { COLLECTIVES, schedule, type Algorithm, type Collective, type Schedule } from '../collectives/schedule'
import { SCOPES, availableScopes, scopeRanks, type Scope } from '../collectives/scope'
import { DEFAULT_PLAN, DIMS, SERVER_COUNTS, gpuCount, planGroup, planProblem, type Dim, type Plan, type PlanGroup } from '../parallel/plan'
import type { AppState } from './transitions'

// The Parallelism view: the plan, the dimension that the grid shows, and the selected GPU (a rank of the job).
export type ParState = Plan & { dim: Dim; cell: number | null }
export const DEFAULT_PAR: ParState = { ...DEFAULT_PLAN, dim: 'tp', cell: null }

// The state of Collectives mode.
// view: one collective, or the parallelism plan. step: 0 is the start. size: the message size of the busbw panel.
// channel: the ring that the diagram and the canvas draw (0 to 7, or all; a ring on 2 nodes only).
// pair: the pair of ranks whose hops the bottom panel shows ("0>1", or "3:0>1" in channel 3). It is not in the URL.
// group: the GPUs of the scope "group".
export type CollState = {
  view: 'collective' | 'parallelism'
  collective: Collective
  algorithm: Algorithm
  scope: Scope
  step: number
  size: SizeId
  channel: number | 'all'
  pair: string | null
  par: ParState
  group: PlanGroup | null
}
export const DEFAULT_COLL: CollState = { view: 'collective', collective: 'allreduce', algorithm: 'ring', scope: '1n', step: 0, size: '1g', channel: 0, pair: null, par: DEFAULT_PAR, group: null }

// The channels of the state: a ring on 2 nodes has one channel for each compute NIC (COLL_FACTS.channelLimit).
export function channelCount(config: Config, c: Pick<CollState, 'scope' | 'algorithm'>): number {
  return (c.scope === '2n' || c.scope === '2s') && c.algorithm === 'ring' ? platformFor(config).computeNic.count.value : 1
}

export function parsePair(key: string): { channel: number; key: string } {
  const m = /^(\d+):(.+)$/.exec(key)
  return m ? { channel: Number(m[1]), key: m[2]! } : { channel: 0, key }
}

// The ranks of the state: the GPUs of the group, the ring of a channel (channel > 0 on 2 nodes), or the scope.
function ranksOf(config: Config, c: CollState, channel: number): string[] | null {
  if (c.scope === 'group') return c.group && c.group.gpus.length >= 2 ? c.group.gpus : null
  return channel > 0 && (c.scope === '2n' || c.scope === '2s') ? channelRanks(config, c.scope, channel) : scopeRanks(config, c.scope)
}

// The schedule that the diagram and the buffers show: the ring of the selected channel (channel 0 for "all"), or null
// when the configuration has no ranks for the scope or the algorithm is not valid for the collective and the scope.
export function collSchedule(config: Config, c: CollState): Schedule | null {
  if (!validAlgorithms(c.collective, c.scope).includes(c.algorithm)) return null
  const ranks = ranksOf(config, c, typeof c.channel === 'number' ? c.channel : 0)
  return ranks ? schedule(c.collective, c.algorithm, ranks) : null
}

// The selected GPU of the plan: it stays when the plan fits and has it.
export const fitCell = (config: Config, p: ParState): number | null => (p.cell !== null && !planProblem(config, p) && p.cell < gpuCount(config, p) ? p.cell : null)

// The state fitted to the configuration and to the plan.
// A scope that the configuration does not have becomes its first scope. An algorithm that is not valid becomes the first valid one.
// A channel that the scope does not have becomes 0. These changes go back to step 0.
// A group stays while the plan gives it the same GPUs. A configuration with no scope keeps the scope.
export function fitColl(config: Config, c: CollState): CollState {
  const scopes = availableScopes(config)
  const now = c.scope === 'group' && c.group !== null ? planGroup(config, c.par, c.group.dim, c.group.index) : null
  // The size counts too: a group of more than 16 GPUs keeps its first 16 GPUs when it grows.
  const groupOk = now !== null && c.group !== null && now.total === c.group.total && now.gpus.join() === c.group.gpus.join()
  const scope = groupOk || scopes.length === 0 || scopes.includes(c.scope) ? c.scope : scopes[0]!
  const valid = validAlgorithms(c.collective, scope)
  const algorithm = valid.includes(c.algorithm) ? c.algorithm : valid[0]!
  const n = channelCount(config, { scope, algorithm })
  const channel = c.channel === 'all' ? (n > 1 ? 'all' : 0) : c.channel < n ? c.channel : 0
  const group = scope === 'group' ? c.group : null
  const cell = fitCell(config, c.par)
  const par = cell === c.par.cell ? c.par : { ...c.par, cell }
  if (par !== c.par && scope === c.scope && algorithm === c.algorithm && channel === c.channel && group === c.group) return { ...c, par }
  return scope === c.scope && algorithm === c.algorithm && channel === c.channel && group === c.group ? c : { ...c, scope, algorithm, channel, group, par, step: 0, pair: null }
}

// A new collective, algorithm, or scope starts again at step 0, with a valid algorithm; a new channel keeps the step
// and drops the selected pair; a new size keeps both. The result is fitted to the configuration.
export function setColl(s: AppState, patch: Partial<Pick<CollState, 'collective' | 'algorithm' | 'scope' | 'size' | 'channel'>>): AppState {
  const c = s.coll
  if (!c || (Object.keys(patch) as (keyof typeof patch)[]).every((k) => patch[k] === c[k])) return s
  let next: CollState = { ...c, ...patch }
  const valid = validAlgorithms(next.collective, next.scope)
  if (!valid.includes(next.algorithm)) next.algorithm = valid[0]!
  if (next.collective !== c.collective || next.algorithm !== c.algorithm || next.scope !== c.scope) next = { ...next, step: 0, pair: null }
  if (next.channel !== c.channel) next = { ...next, pair: null }
  return { ...s, coll: fitColl(s.config, next) }
}

// The step, kept inside the schedule (0 to the number of steps).
export function setCollStep(s: AppState, step: number): AppState {
  if (!s.coll || !Number.isInteger(step)) return s
  const sc = collSchedule(s.config, s.coll)
  if (!sc) return s
  const k = Math.max(0, Math.min(sc.steps.length, step))
  return k === s.coll.step ? s : { ...s, coll: { ...s.coll, step: k } }
}

// The pair whose hops the bottom panel shows; null shows the buffers again. Only a pair of the schedule of its channel.
export function setCollPair(s: AppState, pair: string | null): AppState {
  if (!s.coll || pair === s.coll.pair) return s
  if (pair !== null) {
    const { channel, key } = parsePair(pair)
    if (channel >= channelCount(s.config, s.coll)) return s
    const ranks = ranksOf(s.config, s.coll, channel)
    if (!ranks || !validAlgorithms(s.coll.collective, s.coll.scope).includes(s.coll.algorithm)) return s
    if (!schedulePairs(schedule(s.coll.collective, s.coll.algorithm, ranks)).some(([a, b]) => pairKey(a, b) === key)) return s
  }
  return { ...s, coll: { ...s.coll, pair } }
}

// The URL form: collective.algorithm.scope.step.size, then .c<channel> or .call when the channel is not 0, or
// .g<dim><index> for the scope "group" (the plan is in the parameter "par").
export const encodeColl = (c: CollState): string =>
  `${c.collective}.${c.algorithm}.${c.scope}.${c.step}.${c.size}${c.scope === 'group' && c.group ? `.g${c.group.dim}${c.group.index}` : c.channel === 0 ? '' : `.c${c.channel}`}`

// The URL form of the plan: servers.tp.cp.ep.dp.pp.dim, then .c<rank> for the selected GPU.
export const encodePar = (p: ParState): string => `${p.servers}.${p.tp}.${p.cp}.${p.ep}.${p.dp}.${p.pp}.${p.dim}${p.cell === null ? '' : `.c${p.cell}`}`

// A bad part of the plan gives the default of that part. A size is 1, 2, 4, … 256.
// A GPU that the plan does not have is dropped (fitCell).
export function decodePar(s: AppState, raw: string | null, view: boolean): AppState {
  if (!s.coll) return s
  const [sv, tp, cp, ep, dp, pp, dim, cell] = (raw ?? '').split('.')
  const size = (x: string | undefined, d: number) => (/^\d+$/.test(x ?? '') && Number(x) >= 1 && Number(x) <= 256 && (Number(x) & (Number(x) - 1)) === 0 ? Number(x) : d)
  const servers = SERVER_COUNTS.find((n) => String(n) === sv) ?? DEFAULT_PAR.servers
  const plan = { servers, tp: size(tp, DEFAULT_PAR.tp), cp: size(cp, DEFAULT_PAR.cp), ep: size(ep, DEFAULT_PAR.ep), dp: size(dp, DEFAULT_PAR.dp), pp: size(pp, DEFAULT_PAR.pp) }
  const c = /^c(\d+)$/.exec(cell ?? '')
  const par: ParState = { ...plan, dim: DIMS.find((x) => x === dim) ?? DEFAULT_PAR.dim, cell: c ? Number(c[1]) : null }
  return { ...s, coll: { ...s.coll, par: { ...par, cell: fitCell(s.config, par) }, view: view ? 'parallelism' : 'collective' } }
}

// A bad part gives the default of that part; a milestone 10 link (scope "1" or "2") still opens; an algorithm that is
// not valid for the collective and the scope gives the first valid one; the step goes through setCollStep.
export function decodeColl(s: AppState, raw: string | null): AppState {
  if (!s.coll || !raw) return s
  const [col, alg, sc, step, size, ch] = raw.split('.')
  const collective = COLLECTIVES.find((x) => x === col) ?? DEFAULT_COLL.collective
  // A group comes from the plan of the link (decodePar runs first).
  // A group that the plan does not have gives the first scope of the configuration.
  const gm = /^g(tp|cp|ep|dp|pp)(\d+)$/.exec(ch ?? '')
  const group = sc === 'group' && gm ? planGroup(s.config, s.coll.par, gm[1] as Dim, Number(gm[2])) : null
  const scope: Scope = group ? 'group' : (SCOPES.find((x) => x === sc) ?? (sc === '2' ? '2n' : sc === 'group' ? (availableScopes(s.config)[0] ?? '1n') : '1n'))
  const valid = validAlgorithms(collective, scope)
  const algorithm = valid.find((x) => x === alg) ?? valid[0]!
  const sz = SIZES.find((x) => x.id === size)?.id ?? DEFAULT_COLL.size
  // The scope stays as the link gives it (a scope that the configuration does not have shows, disabled, with the reason);
  // only the channel is fitted.
  const n = channelCount(s.config, { scope, algorithm })
  const want = ch === 'call' ? 'all' : /^c\d+$/.test(ch ?? '') ? Number(ch!.slice(1)) : 0
  const channel = want === 'all' ? (n > 1 ? 'all' : 0) : want < n ? want : 0
  return setCollStep({ ...s, coll: { ...DEFAULT_COLL, view: s.coll.view, par: s.coll.par, collective, algorithm, scope, size: sz, channel, group } }, Number(step))
}
