import type { BlockRole } from '../catalog/factory'
import { healthClass, verdictOf, SEVERITIES } from '../catalog/health'
import { LIFECYCLE_BY_ID, MODELLED, lifecycleClass, lifecycleOf } from '../catalog/lifecycle'
import type { DocKind } from '../catalog/kinds'
import { OWNERS, ownerOf, type OwnerId } from '../catalog/ownership'
import type { Config } from '../config/config'
import { NODE_STATES, NON_GPU_TENANTS, assignments, stateCounts, tenantNames, type NodeState } from '../topology/assign'
import type { HostAt } from '../telemetry/replay'
import type { Network } from '../topology/graph'
import { rackOf } from '../topology/racks'

export type ColorOverlay = 'none' | 'owner' | 'tenant' | 'state' | 'phase' | 'lifecycle' | 'health'
export const COLOR_OVERLAYS: { id: ColorOverlay; label: string }[] = [
  { id: 'none', label: 'No colour overlay' },
  { id: 'owner', label: 'Ownership' },
  { id: 'tenant', label: 'Tenancy' },
  { id: 'state', label: 'Node state' },
  { id: 'phase', label: 'Phase' },
  { id: 'lifecycle', label: 'Lifecycle (NICo)' },
  { id: 'health', label: 'Health verdict' },
]

export type LayerId = 'compute' | 'storage' | 'in-band' | 'oob' | 'nvlink' | 'pcie' | 'power' | 'cooling' | 'services'
export const LAYERS: { id: LayerId; label: string; networks: Network[] }[] = [
  { id: 'compute', label: 'Compute', networks: ['compute'] },
  { id: 'storage', label: 'Storage', networks: ['storage'] },
  { id: 'in-band', label: 'In-band and north-south', networks: ['in-band', 'converged', 'north-south', 'management'] },
  { id: 'oob', label: 'Out-of-band', networks: ['oob'] },
  { id: 'nvlink', label: 'NVLink', networks: ['nvlink', 'c2c'] },
  { id: 'pcie', label: 'PCIe and memory', networks: ['pcie', 'memory'] },
  { id: 'power', label: 'Power', networks: ['power'] },
  { id: 'cooling', label: 'Cooling', networks: ['cooling'] },
  { id: 'services', label: 'Node services', networks: ['service'] },
]

export type Overlay = { color: ColorOverlay; hidden: LayerId[]; telemetry: boolean; topo: boolean }
export const NO_OVERLAY: Overlay = { color: 'none', hidden: [], telemetry: false, topo: false }

export const hiddenNetworks = (hidden: LayerId[]): Set<string> => new Set(LAYERS.filter((l) => hidden.includes(l.id)).flatMap((l) => l.networks))

const FILL_OWNERS: OwnerId[] = ['partner', 'facility', 'enterprise', 'rafay', 'vast', 'customer-it']
const tenantClass = (name: string) => (name === 'UAT' ? 'ov-ten-uat' : `ov-ten-${name.slice('Tenant '.length)}`)

export const ALL_COLOR_CLASSES = [
  ...Object.keys(OWNERS).map((o) => `ov-own-${o}`),
  'ov-ten-uat',
  ...Array.from({ length: 8 }, (_, i) => `ov-ten-${i + 1}`),
  ...NODE_STATES.map((s) => `ov-st-${s}`),
  'ov-st-spare',
  'ov-ph-1',
  'ov-ph-2',
  ...MODELLED.map((s) => `ov-lc-${s}`),
  'ov-lc-spare',
  ...SEVERITIES.map((s) => `ov-hl-${s.id.toLowerCase()}`),
  'ov-hl-none',
  'ov-hl-spare',
].join(' ')

// The class of one canvas element for the colour overlay, or null when it has no value.
// `at` is the state of each host at the cursor of the time view; without it, the state is the state of today.
export function colorClass(config: Config, color: ColorOverlay, el: { id: string; kind?: string; role?: string }, at?: Map<string, HostAt> | null): string | null {
  if (color === 'none' || !el.kind) return null
  if (color === 'owner') {
    // A compound parent (an open SU, a rack box, a tray) keeps its light fill, so its children stay visible.
    if (['umark', 'anchor', 'su', 'rack', 'tray', 'switch-tray'].includes(el.kind)) return null
    if (el.kind === 'cdu') return `ov-own-${ownerOf(config, { kind: 'rack', rackRole: 'cdu' }).id}`
    const rackRole = el.kind === 'rack' ? rackOf(config, el.id)?.role : undefined
    const part = { kind: el.kind as DocKind, ...(el.role ? { role: el.role as BlockRole } : {}), ...(rackRole ? { rackRole } : {}) }
    return `ov-own-${ownerOf(config, part).id}`
  }
  if (color === 'state' && el.kind === 'block' && el.role === 'spares') return 'ov-st-spare'
  if ((color === 'lifecycle' || color === 'health') && el.kind === 'block' && el.role === 'spares') return color === 'lifecycle' ? 'ov-lc-spare' : 'ov-hl-spare'
  if (el.kind !== 'server' && el.kind !== 'tray') return null
  const a = assignments(config).get(el.id)
  if (!a) return null
  if (color === 'tenant') return tenantClass(a.tenant)
  if (color === 'phase') return `ov-ph-${a.phase}`
  // The state of the host at the cursor of the time view; without a cursor, the state of today.
  const state = at?.get(el.id)?.state ?? a.state
  if (color === 'state') return `ov-st-${state}`
  if (color === 'lifecycle') return lifecycleClass(lifecycleOf(state))
  return healthClass(state)
}

export type LegendItem = { cls: string; label: string; count?: number }

export function legendOf(config: Config, color: ColorOverlay, at?: Map<string, HostAt> | null): LegendItem[] {
  const all = [...assignments(config).values()]
  // The state of each host at the cursor, in the order of the assignments, for the counts of the time view.
  const states: NodeState[] = at === undefined || at === null ? all.map((a) => a.state) : [...assignments(config).entries()].map(([id, a]) => at.get(id)?.state ?? a.state)
  const countOf = (test: (s: NodeState) => boolean) => states.filter(test).length
  switch (color) {
    case 'none':
      return []
    case 'owner':
      // Only the owners that ownerOf gives to a part: the OEM (L4) and the customer workload own no part on the canvas.
      return FILL_OWNERS.map((o) => ({ cls: `ov-own-${o}`, label: OWNERS[o].label }))
    case 'tenant':
      return [
        ...tenantNames(config).map((t) => ({ cls: tenantClass(t), label: t, count: all.filter((a) => a.tenant === t).length })),
        ...NON_GPU_TENANTS.map((t) => ({ cls: 'ov-none', label: `${t} (no GPU)` })),
      ]
    case 'state': {
      const counts = stateCounts(config)
      return [...NODE_STATES.map((s) => ({ cls: `ov-st-${s}`, label: s, count: at ? countOf((x) => x === s) : counts[s] })), { cls: 'ov-st-spare', label: 'spare (outside the fabric)', count: config.spares }]
    }
    case 'phase':
      return ([1, 2] as const).map((p) => ({ cls: `ov-ph-${p}`, label: `Phase ${p}`, count: all.filter((a) => a.phase === p).length }))
    case 'lifecycle':
      return [
        ...MODELLED.map((id) => ({
          cls: `ov-lc-${id}`,
          label: LIFECYCLE_BY_ID.get(id)!.label,
          count: at ? countOf((s) => lifecycleOf(s) === id) : all.filter((a) => lifecycleOf(a.state) === id).length,
        })),
        { cls: 'ov-lc-spare', label: 'spare (outside the fabric)', count: config.spares },
      ]
    case 'health':
      return [
        ...SEVERITIES.map((s) => ({
          cls: `ov-hl-${s.id.toLowerCase()}`,
          label: s.label,
          count: at ? countOf((x) => verdictOf(x)?.severity === s.id) : all.filter((a) => verdictOf(a.state)?.severity === s.id).length,
        })),
        { cls: 'ov-hl-none', label: 'in maintenance (no verdict)', count: at ? countOf((x) => x === 'maintenance') : all.filter((a) => a.state === 'maintenance').length },
        { cls: 'ov-hl-spare', label: 'spare (outside the fabric)', count: config.spares },
      ]
  }
}
