import type { Config } from '../config/config'
import { fabricShape, generateFabric } from './fabric'
import { parseServerId } from './ids'

export type NodeState = 'available' | 'allocated' | 'degraded' | 'quarantined' | 'maintenance'
export const NODE_STATES: NodeState[] = ['available', 'allocated', 'degraded', 'quarantined', 'maintenance']
export type Assignment = { tenant: string; state: NodeState; phase: 1 | 2 }
export const NON_GPU_TENANTS = ['NOC', 'Management', 'Storage'] // plan/requirements-map.md:34

export const ASSIGN_NOTE =
  'The site gives no tenant, node state, or phase for each server. You set the counts in the Overlays panel; the app spreads them over the servers by a fixed rule.'

export function tenantNames(config: Config): string[] {
  const names = Array.from({ length: config.tenants }, (_, i) => `Tenant ${i + 1}`)
  return config.uat === 'on' ? [...names, 'UAT'] : names
}

const cache = new WeakMap<Config, Map<string, Assignment>>()

// The servers in slot order (SU, then slot), and for each one its tenant, state, and phase.
export function assignments(config: Config): Map<string, Assignment> {
  const hit = cache.get(config)
  if (hit) return hit
  const shape = fabricShape(config)
  const ids = generateFabric(config)
    .nodes.filter((n) => n.kind === 'server')
    .map((n) => n.id)
  const total = ids.length

  // Tenants: the UAT tenant takes the first rack, but no more than an equal share (one NVL72 rack is all
  // the trays); the GPU tenants share the rest in contiguous blocks.
  const uat = config.uat === 'on' ? Math.min(shape.perRack, Math.floor(total / (config.tenants + 1))) : 0
  const rest = total - uat
  const tenantOf = (i: number) => (i < uat ? 'UAT' : `Tenant ${Math.floor(((i - uat) * config.tenants) / Math.max(rest, 1)) + 1}`)

  // States: the problem states from the last server back; then the allocated share from the front.
  const states = new Array<NodeState>(total).fill('available')
  let k = total - 1
  for (const [state, count] of [
    ['degraded', config.degraded],
    ['quarantined', config.quarantined],
    ['maintenance', config.maintenance],
  ] as const) {
    for (let c = 0; c < count && k >= 0; c++, k--) states[k] = state
  }
  const healthy = k + 1
  const allocated = Math.round((healthy * config.allocated) / 100)
  for (let i = 0; i < allocated; i++) states[i] = 'allocated'

  // Phases: with 2 SU or more, the first half of the SUs (rounded up) is phase 1; with 1 SU, the first half
  // of its racks, or of its trays when the SU is one rack.
  const racksPerSu = shape.perSu / shape.perRack
  const phaseOf = (id: string): 1 | 2 => {
    if (config.phases === 'one') return 1
    const p = parseServerId(id)!
    if (config.suCount > 1) return p.su <= Math.ceil(config.suCount / 2) ? 1 : 2
    if (racksPerSu <= 1) return p.n <= Math.ceil(shape.perSu / 2) ? 1 : 2
    return Math.ceil(p.n / shape.perRack) <= Math.ceil(racksPerSu / 2) ? 1 : 2
  }

  const map = new Map<string, Assignment>()
  ids.forEach((id, i) => map.set(id, { tenant: tenantOf(i), state: states[i]!, phase: phaseOf(id) }))
  cache.set(config, map)
  return map
}

export function stateCounts(config: Config): Record<NodeState, number> {
  const counts: Record<NodeState, number> = { available: 0, allocated: 0, degraded: 0, quarantined: 0, maintenance: 0 }
  for (const a of assignments(config).values()) counts[a.state]++
  return counts
}
