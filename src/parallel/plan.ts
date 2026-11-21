import { platformFor } from '../catalog/platforms'
import type { Config } from '../config/config'
import { firstServers } from '../collectives/scope'
import { MAX_RANKS, type Algorithm, type Collective } from '../collectives/schedule'
import { traceGpus, type Trace } from '../routing/trace'
import { partId } from '../topology/ids'

export type Dim = 'tp' | 'cp' | 'ep' | 'dp' | 'pp'
export const DIMS: Dim[] = ['tp', 'cp', 'ep', 'dp', 'pp']
export const DIM_LABEL: Record<Dim, string> = { tp: 'TP', cp: 'CP', ep: 'EP', dp: 'DP', pp: 'PP' }
export const DIM_NAME: Record<Dim, string> = { tp: 'tensor', cp: 'context', ep: 'expert', dp: 'data', pp: 'pipeline' }

// The parallelism plan of a job: the servers (or trays) of SU 1 that it uses, and the size of each dimension.
export type Plan = { servers: number; tp: number; cp: number; ep: number; dp: number; pp: number }
export const DEFAULT_PLAN: Plan = { servers: 4, tp: 8, cp: 1, ep: 1, dp: 4, pp: 1 }
export const SERVER_COUNTS = [1, 2, 4, 8, 16, 32]

export const gpuCount = (config: Config, plan: Plan): number => plan.servers * platformFor(config).gpusPerServer.value

// The job sizes of this configuration: the counts that SU 1 has.
export const jobSizes = (config: Config): number[] => SERVER_COUNTS.filter((n) => firstServers(config, n) !== null)

// The sizes that a dimension can have: 1, 2, 4, … up to the GPU count.
export function sizeChoices(total: number): number[] {
  const out: number[] = []
  for (let n = 1; n <= total; n *= 2) out.push(n)
  return out
}

// Why the plan does not fit the job, or null.
export function planProblem(config: Config, plan: Plan): string | null {
  const unit = platformFor(config).form === 'nvl72-tray' ? 'trays' : 'servers'
  if (!firstServers(config, plan.servers)) return `SU 1 of this design has fewer than ${plan.servers} ${unit}. Select a smaller job.`
  const g = gpuCount(config, plan)
  const product = plan.tp * plan.cp * plan.dp * plan.pp
  if (product !== g) return `TP × CP × DP × PP = ${plan.tp} × ${plan.cp} × ${plan.dp} × ${plan.pp} = ${product}, but the job has ${g} GPUs. Change a size so that the product is ${g}.`
  if ((plan.dp * plan.cp) % plan.ep !== 0) return `EP must divide DP × CP = ${plan.dp * plan.cp}: the expert groups are cut from those ranks.`
  return null
}

// The key of the group of a rank: the coordinates that stay the same in the group.
// The order is tp-cp-ep-dp-pp (PAR_FACTS.order). EP has its own rule (PAR_FACTS.epRule).
// rank = tp + cp × TP + dp × TP × CP + pp × TP × CP × DP.
function keyOf(plan: Plan, rank: number, dim: Dim): string {
  const tp = rank % plan.tp
  const cp = Math.floor(rank / plan.tp) % plan.cp
  const dp = Math.floor(rank / (plan.tp * plan.cp)) % plan.dp
  const pp = Math.floor(rank / (plan.tp * plan.cp * plan.dp))
  switch (dim) {
    case 'tp':
      return `${cp}.${dp}.${pp}`
    case 'cp':
      return `${tp}.${dp}.${pp}`
    case 'dp':
      return `${tp}.${cp}.${pp}`
    case 'pp':
      return `${tp}.${cp}.${dp}`
    case 'ep':
      return `${tp}.${pp}.${Math.floor((cp + dp * plan.cp) / plan.ep)}`
  }
}

// The groups of a dimension, each in rank order. The groups have the order of their first rank, so group 0 has rank 0.
export function groupsOf(plan: Plan, total: number, dim: Dim): number[][] {
  const at = new Map<string, number[]>()
  for (let r = 0; r < total; r++) {
    const k = keyOf(plan, r, dim)
    const g = at.get(k)
    if (g) g.push(r)
    else at.set(k, [r])
  }
  return [...at.values()]
}

// The group number of a rank in each dimension.
export function groupIndexes(plan: Plan, total: number, rank: number): Record<Dim, number> {
  return Object.fromEntries(DIMS.map((d) => [d, groupsOf(plan, total, d).findIndex((g) => g.includes(rank))])) as Record<Dim, number>
}

// The GPU of each rank of the job (PAR_FACTS.rankOrder); null when SU 1 has too few servers.
export function rankGpus(config: Config, plan: Plan): string[] | null {
  const servers = firstServers(config, plan.servers)
  if (!servers) return null
  const g = platformFor(config).gpusPerServer.value
  return Array.from({ length: plan.servers * g }, (_, r) => partId(servers[Math.floor(r / g)]!, `gpu${r % g}`))
}

export type Net = 'none' | 'server' | 'rack' | 'leaf' | 'pxn' | 'spine'
export const NET_LABEL: Record<Net, string> = {
  none: 'no traffic (1 GPU)',
  server: 'NVLink (one server)',
  rack: 'NVLink (one rack)',
  leaf: 'one leaf (same rail)',
  pxn: 'one leaf, with PXN (NVLink to the GPU on the rail of the peer first)',
  spine: 'spine',
}
// The network of one path. Inside a server or a rack, the kind of the trace gives it.
// Through the fabric, the hops give it: a spine, or else NVLink to another GPU first (PXN), or else one leaf.
function netOf(t: Trace): Net {
  if (t.kind === 'same-node') return 'server'
  if (t.kind === 'nvl72-rack') return 'rack'
  if (t.hops.some((h) => h.to.kind === 'spine')) return 'spine'
  return t.hops.some((h) => h.link === 'nvlink') ? 'pxn' : 'leaf'
}
const FAR: Net[] = ['none', 'server', 'rack', 'leaf', 'pxn', 'spine']

// The network of a group: the farthest path from its first GPU to each other GPU.
// "Same server" and "same leaf" are transitive. Thus the paths from the first GPU are sufficient.
// The traces use the default options and no failures.
export function groupNetwork(config: Config, gpus: string[]): Net {
  let far: Net = 'none'
  for (const id of gpus.slice(1)) {
    const r = traceGpus(config, gpus[0]!, id)
    if (r.ok && FAR.indexOf(netOf(r.trace)) > FAR.indexOf(far)) far = netOf(r.trace)
  }
  return far
}

// The collective that "Play this group" shows for each dimension (PAR_FACTS.collective). PP is send and receive
// between neighbour stages: Collective view has no model of it.
export const PLAY: Record<Dim, { collective: Collective; algorithm: Algorithm } | null> = {
  tp: { collective: 'allreduce', algorithm: 'ring' },
  cp: { collective: 'allgather', algorithm: 'ring' },
  ep: { collective: 'alltoall', algorithm: 'p2p' },
  dp: { collective: 'allreduce', algorithm: 'ring' },
  pp: null,
}

// A group to play in Collective view: its dimension, its number, its first 16 GPUs (PAR_FACTS.playCap), and its size.
export type PlanGroup = { dim: Dim; index: number; gpus: string[]; total: number }

// Null when the plan does not fit, the group does not exist, or the group has 1 GPU (no traffic).
export function planGroup(config: Config, plan: Plan, dim: Dim, index: number): PlanGroup | null {
  if (planProblem(config, plan)) return null
  const gpus = rankGpus(config, plan)!
  const g = groupsOf(plan, gpus.length, dim)[index]
  if (!g || g.length < 2) return null
  return { dim, index, gpus: g.slice(0, MAX_RANKS).map((r) => gpus[r]!), total: g.length }
}

export const groupLabel = (g: PlanGroup): string =>
  `${DIM_LABEL[g.dim]} group ${g.index} (${g.total} GPUs${g.total > g.gpus.length ? `, the first ${g.gpus.length} play` : ''})`
