import { DESIGNS, designById, type FabricDesign, type RaRow } from '../catalog/designs'
import type { BuildId, DesignId, FabricId, PlanesId, PlatformId, TopologyId } from '../catalog/kinds'

export type { BuildId, DesignId, FabricId, PlanesId, PlatformId, TopologyId }

export type Config = {
  platform: PlatformId
  build: BuildId
  fabric: FabricId
  design: DesignId
  topology: TopologyId
  planes: PlanesId
  suCount: number
  lastSuEmpty: number
  spares: number
  ufm: 'ha' | 'single' | 'none'
  cooling: 'air' | 'liquid'
  storageFabric: 'converged' | 'ethernet' | 'infiniband'
  frontendSpines: number
  frontendLeaves: number
  oobSwitches: number
  automation: 'none' | 'netris'
  cboxes: number
  dboxes: number
  gds: 'on' | 'off'
  ceph: 'off' | 'on'
  linstor: 'off' | 'on'
  clusterManager: 'rafay-only' | 'bcm' | 'mission-control'
  orchestration: 'kubernetes' | 'slurm' | 'both'
  rafay: 'self-hosted' | 'saas' | 'none'
  vms: 'off' | 'kubevirt'
  lb: 'firewall-l4' | 'haproxy' | 'none'
  edgeRouters: number
  uplink: '2x100g' | '2x400g'
  tenants: number
  uat: 'on' | 'off'
  allocated: number
  degraded: number
  quarantined: number
  maintenance: number
  phases: 'two' | 'one'
  itsm: 'off' | 'on'
  p1Threshold: number
  p2Threshold: number
}

// Generic defaults: no site scale, no site counts.
export const DEFAULT_CONFIG: Config = {
  platform: 'b300',
  build: 'dgx',
  fabric: 'ib-xdr',
  design: 'b300-xdr',
  topology: 'rail',
  planes: 'single',
  suCount: 1,
  lastSuEmpty: 0,
  spares: 0,
  ufm: 'ha',
  cooling: 'air',
  storageFabric: 'converged',
  frontendSpines: 0,
  frontendLeaves: 2,
  oobSwitches: 2,
  automation: 'none',
  cboxes: 2,
  dboxes: 2,
  gds: 'on',
  ceph: 'off',
  linstor: 'off',
  clusterManager: 'rafay-only',
  orchestration: 'kubernetes',
  rafay: 'self-hosted',
  vms: 'off',
  lb: 'firewall-l4',
  edgeRouters: 2,
  uplink: '2x100g',
  tenants: 2,
  uat: 'on',
  allocated: 50,
  degraded: 1,
  quarantined: 1,
  maintenance: 1,
  phases: 'two',
  itsm: 'off',
  p1Threshold: 25,
  p2Threshold: 5,
}

// The repair order: the valid values of a switch depend only on the switches before it.
// The keys of panels 2 to 6 come after the compute keys, so the compute repairs do not change.
export const KEYS: (keyof Config)[] = [
  'platform',
  'build',
  'fabric',
  'design',
  'topology',
  'planes',
  'suCount',
  'lastSuEmpty',
  'spares',
  'ufm',
  'cooling',
  'storageFabric',
  'frontendSpines',
  'frontendLeaves',
  'oobSwitches',
  'automation',
  'cboxes',
  'dboxes',
  'gds',
  'ceph',
  'linstor',
  'clusterManager',
  'orchestration',
  'rafay',
  'vms',
  'lb',
  'edgeRouters',
  'uplink',
  'tenants',
  'uat',
  'allocated',
  'degraded',
  'quarantined',
  'maintenance',
  'phases',
  'itsm',
  'p1Threshold',
  'p2Threshold',
]

export type Choice<V> = { value: V; label: string }

type DynamicKey = 'suCount' | 'lastSuEmpty'
type FixedKey = Exclude<keyof Config, DynamicKey>
const nums = (values: number[], unit: string): Choice<number>[] => values.map((v) => ({ value: v, label: `${v} ${unit}` }))

const FIXED: { [K in FixedKey]: Choice<Config[K]>[] } = {
  platform: [
    { value: 'b300', label: 'B300 (HGX, 8 GPUs)' },
    { value: 'b200', label: 'B200 (HGX, 8 GPUs)' },
    { value: 'h100', label: 'H100 (HGX, 8 GPUs)' },
    { value: 'h200', label: 'H200 (HGX, 8 GPUs)' },
    { value: 'gb200-nvl72', label: 'GB200 NVL72 (rack, 72 GPUs)' },
    { value: 'gb300-nvl72', label: 'GB300 NVL72 (rack, 72 GPUs)' },
  ],
  build: [
    { value: 'dgx', label: 'DGX' },
    { value: 'oem-hgx', label: 'OEM HGX (Dell XE9780)' },
  ],
  fabric: [
    { value: 'ib-xdr', label: 'InfiniBand XDR (Quantum-X800)' },
    { value: 'ib-ndr', label: 'InfiniBand NDR (Quantum-2)' },
    { value: 'spectrum-x', label: 'Spectrum-X Ethernet (SN5600/SN5610)' },
  ],
  design: DESIGNS.map((d) => ({ value: d.id, label: d.short })),
  topology: [
    { value: 'rail', label: 'Rail-optimized' },
    { value: 'tor', label: 'Top-of-rack (illustration)' },
  ],
  planes: [
    { value: 'single', label: 'Single plane' },
    { value: 'dual', label: 'Dual plane' },
  ],
  spares: nums([0, 2, 4, 8], 'spares'),
  ufm: [
    { value: 'ha', label: 'UFM HA pair (active/standby)' },
    { value: 'single', label: 'One UFM' },
    { value: 'none', label: 'No UFM' },
  ],
  cooling: [
    { value: 'air', label: 'Air' },
    { value: 'liquid', label: 'Liquid (CDU)' },
  ],
  storageFabric: [
    { value: 'converged', label: 'Converged with the frontend (RoCE)' },
    { value: 'ethernet', label: 'Separate Ethernet (RoCE)' },
    { value: 'infiniband', label: 'Separate InfiniBand (NDR)' },
  ],
  frontendSpines: nums([0, 2, 4, 8], 'spines'),
  frontendLeaves: nums([2, 4, 8, 16], 'leaves'),
  oobSwitches: nums([1, 2, 4, 8, 16, 32, 64], 'SN2201'),
  automation: [
    { value: 'none', label: 'None' },
    { value: 'netris', label: 'Netris (decision open)' },
  ],
  cboxes: nums([1, 2, 4, 8, 16], 'CBoxes'),
  dboxes: nums([1, 2, 4, 8, 16, 32], 'DBoxes'),
  gds: [
    { value: 'on', label: 'GPUDirect Storage on' },
    { value: 'off', label: 'GPUDirect Storage off' },
  ],
  ceph: [
    { value: 'off', label: 'No Ceph' },
    { value: 'on', label: 'Ceph (3 nodes, role not decided)' },
  ],
  linstor: [
    { value: 'off', label: 'No Linstor' },
    { value: 'on', label: 'Linstor (3 nodes, role not decided)' },
  ],
  clusterManager: [
    { value: 'rafay-only', label: 'Rafay only' },
    { value: 'bcm', label: 'Base Command Manager' },
    { value: 'mission-control', label: 'Mission Control' },
  ],
  orchestration: [
    { value: 'kubernetes', label: 'Kubernetes through Rafay' },
    { value: 'slurm', label: 'Slurm' },
    { value: 'both', label: 'Both' },
  ],
  rafay: [
    { value: 'self-hosted', label: 'Self-hosted controller (HA)' },
    { value: 'saas', label: 'SaaS controller' },
    { value: 'none', label: 'No Rafay' },
  ],
  vms: [
    { value: 'off', label: 'Containers only' },
    { value: 'kubevirt', label: 'Containers and VMs (KubeVirt, branch)' },
  ],
  lb: [
    { value: 'firewall-l4', label: 'Firewall at L4' },
    { value: 'haproxy', label: 'HAProxy or Nginx on the control nodes' },
    { value: 'none', label: 'No load balancer' },
  ],
  edgeRouters: nums([1, 2], 'edge routers'),
  uplink: [
    { value: '2x100g', label: '2 × 100GbE (the RA minimum)' },
    { value: '2x400g', label: '2 × 400GbE' },
  ],
  tenants: nums([1, 2, 3, 4, 6, 8], 'GPU tenants'),
  uat: [
    { value: 'on', label: 'UAT tenant with GPUs' },
    { value: 'off', label: 'No UAT tenant' },
  ],
  allocated: [0, 25, 50, 75, 100].map((v) => ({ value: v, label: `${v}% of the healthy nodes allocated` })),
  degraded: nums([0, 1, 2, 4, 8], 'degraded'),
  quarantined: nums([0, 1, 2, 4, 8], 'quarantined'),
  maintenance: nums([0, 1, 2, 4, 8], 'in maintenance'),
  phases: [
    { value: 'two', label: 'Two phases of equal size' },
    { value: 'one', label: 'One phase' },
  ],
  itsm: [
    { value: 'off', label: 'No ITSM integration (L1 opens the ticket)' },
    { value: 'on', label: 'ITSM integration (Alertmanager webhook)' },
  ],
  p1Threshold: [10, 25, 50].map((v) => ({ value: v, label: `P1 from ${v}% of the GPUs` })),
  p2Threshold: [1, 2, 5, 10].map((v) => ({ value: v, label: `P2 from ${v}% of the GPUs` })),
}

export function suLabel(d: FabricDesign, r: RaRow): string {
  if (d.leafRule.kind === 'none') return `1 rack (${r.nodes} trays)`
  return `${r.su} SU (${r.nodes} ${d.serverWord})`
}

export function choicesFor<K extends keyof Config>(config: Config, key: K): Choice<Config[K]>[] {
  const d = designById(config.design)
  if (key === 'suCount') return d.rows.map((r) => ({ value: r.su, label: suLabel(d, r) })) as Choice<Config[K]>[]
  if (key === 'lastSuEmpty') {
    // Whole racks left empty in the last SU: none (a full SU) up to all racks but one.
    const perRack = d.serversPerRack.value
    const racks = Math.ceil(d.serversPerSu.value / perRack)
    return Array.from({ length: racks }, (_, i) => ({
      value: i * perRack,
      label: i === 0 ? 'None (a full SU)' : `${i * perRack} slots (${i} ${i === 1 ? 'rack' : 'racks'})`,
    })) as Choice<Config[K]>[]
  }
  return FIXED[key as FixedKey] as Choice<Config[K]>[]
}
