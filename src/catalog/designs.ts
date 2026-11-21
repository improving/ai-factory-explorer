import { assumed, confirmed, derived, type Fact } from './fact'
import type { BuildId, DesignId, FabricId, PlanesId, PlatformId } from './kinds'
import { Q3400, QM9700, SN5600, type Switch } from './switches'
import {
  B200_FABRICS_URL,
  DGX_B_URL,
  DGX_H_URL,
  ENT_LOGICAL_URL,
  ENT_PHYSICAL_URL,
  GB200_ARCH_URL,
  GB300_RA_URL,
  H100_ARCH_URL,
  NVL72_UG_URL,
  SPX_COMPONENTS_URL,
  SPX_FABRICS_URL,
  XDR_COMPONENTS_URL,
  XDR_FABRICS_URL,
  XDR_RA_URL,
} from './urls'

// How the NIC ports of one server reach the leaf switches of its group.
export type LeafRule =
  | { kind: 'rail' } // one leaf for each rail and plane: leaf = plane × rails + rail
  | { kind: 'rail-pairs'; pairs: number } // a leaf serves rails r and r + pairs: leaf = plane × pairs + rail mod pairs
  | { kind: 'rail-split'; split: number } // two leaves for each rail: slots 1..split on the first, the rest on the second
  | { kind: 'none' } // one rack, no scale-out fabric in this version

// One row of an RA table, as published. A missing cable count means that the RA does not give it.
export type RaRow = {
  su: number
  nodes: number
  gpus?: number
  leaf: number
  spine: number
  nodeLeafCables?: number
  leafSpineCables?: number
}

export type FabricDesign = {
  id: DesignId
  name: string
  short: string
  source: string
  fabric: FabricId
  platforms: PlatformId[]
  builds?: BuildId[] // the builds that the design takes; all builds when not set
  serverWord: 'servers' | 'nodes' | 'trays'
  serversPerSu: Fact<number> // the slots of one SU
  serversPerRack: Fact<number>
  susPerGroup: number // the SUs that share one set of leaf switches
  rails: Fact<number>
  planes: PlanesId
  leafRule: LeafRule
  linkSpeed: Fact<number> // one node-leaf link, in Gb/s
  leafSwitch: Switch
  spineSwitch: Switch
  rows: RaRow[]
  reservedSlots: { su: number; slot: number; reason: string }[]
  notes: string[] // conflicts and gaps of the pages; the inspector shows them
}

const RACK4 = 'Not on the pages read; the app puts 4 servers in each rack, for the picture.'

export const B300_XDR: FabricDesign = {
  id: 'b300-xdr',
  name: 'DGX SuperPOD with DGX B300, Quantum-X800 XDR InfiniBand',
  short: 'B300 SuperPOD, XDR InfiniBand',
  source: XDR_RA_URL,
  fabric: 'ib-xdr',
  platforms: ['b300'],
  serverWord: 'servers',
  serversPerSu: confirmed(72, 'servers', XDR_COMPONENTS_URL),
  serversPerRack: confirmed(4, 'servers', XDR_RA_URL),
  susPerGroup: 1,
  rails: derived(8, 'rails', 'one rail for each of the 8 GPU NICs; 8 leaf switches for each SU', XDR_RA_URL),
  planes: 'single',
  leafRule: { kind: 'rail' },
  linkSpeed: confirmed(800, 'Gb/s', XDR_FABRICS_URL),
  leafSwitch: Q3400,
  spineSwitch: Q3400,
  rows: [
    { su: 1, nodes: 72, gpus: 576, leaf: 8, spine: 4, nodeLeafCables: 576, leafSpineCables: 576 },
    { su: 2, nodes: 144, gpus: 1152, leaf: 16, spine: 8, nodeLeafCables: 1152, leafSpineCables: 1152 },
    { su: 4, nodes: 288, gpus: 2304, leaf: 32, spine: 18, nodeLeafCables: 2304, leafSpineCables: 2304 },
    { su: 8, nodes: 576, gpus: 4608, leaf: 64, spine: 36, nodeLeafCables: 4608, leafSpineCables: 4608 },
    { su: 18, nodes: 1296, gpus: 9216, leaf: 144, spine: 72, nodeLeafCables: 10368, leafSpineCables: 10368 },
  ],
  reservedSlots: [],
  notes: [
    'Table 1 says "twin-plane"; the components page says "full-fat tree". The app draws one 800 Gb/s cable for each GPU NIC, as in Figure 5.',
  ],
}

export const B300_SPX: FabricDesign = {
  id: 'b300-spx',
  name: 'DGX SuperPOD with DGX B300, Spectrum-X Ethernet',
  short: 'B300 SuperPOD, Spectrum-X Ethernet',
  source: SPX_COMPONENTS_URL,
  fabric: 'spectrum-x',
  platforms: ['b300'],
  serverWord: 'servers',
  serversPerSu: confirmed(64, 'servers', SPX_COMPONENTS_URL),
  serversPerRack: assumed(4, 'servers', 'The XDR RA puts up to four DGX B300 in a rack; the app uses the same for the Ethernet RA.'),
  susPerGroup: 1,
  rails: derived(8, 'rails', '8 leaf switches in each plane for each SU', SPX_FABRICS_URL),
  planes: 'dual',
  leafRule: { kind: 'rail' },
  linkSpeed: confirmed(400, 'Gb/s for each plane', SPX_FABRICS_URL),
  leafSwitch: SN5600,
  spineSwitch: SN5600,
  rows: [{ su: 4, nodes: 256, gpus: 2048, leaf: 64, spine: 32, nodeLeafCables: 4096, leafSpineCables: 4096 }],
  reservedSlots: [],
  notes: [
    'The RA text says a tested system has 4 SU; a figure shows 8 SU (512 nodes). The app offers the 4 SU table.',
    'Table 1 names Q3400 InfiniBand for the compute fabric; Table 7 and the fabric page use SN5600. The app uses SN5600.',
    'The RA gives six 5.5 kW power shelves in one place and four in each rack in another.',
  ],
}

export const ENT_B300: FabricDesign = {
  id: 'ent-b300',
  name: 'Enterprise RA for HGX AI Factory, HGX B300, Spectrum-X Ethernet',
  short: 'Enterprise RA, HGX B300, Spectrum-X',
  source: ENT_LOGICAL_URL,
  fabric: 'spectrum-x',
  platforms: ['b300'],
  builds: ['oem-hgx'],
  serverWord: 'nodes',
  serversPerSu: confirmed(4, 'nodes', ENT_LOGICAL_URL),
  serversPerRack: assumed(4, 'nodes', 'Not in the RA; the app puts one SU in each rack, for the picture.'),
  susPerGroup: 8,
  rails: derived(8, 'rails', '8 ConnectX-8 SuperNICs for each node', ENT_LOGICAL_URL),
  planes: 'dual',
  leafRule: { kind: 'rail-pairs', pairs: 4 },
  linkSpeed: confirmed(400, 'Gb/s for each plane', ENT_PHYSICAL_URL),
  leafSwitch: SN5600,
  spineSwitch: SN5600,
  rows: [
    { su: 8, nodes: 32, gpus: 256, leaf: 8, spine: 4 },
    { su: 16, nodes: 64, gpus: 512, leaf: 16, spine: 8 },
    { su: 32, nodes: 128, gpus: 1024, leaf: 32, spine: 16 },
  ],
  reservedSlots: [],
  notes: [
    'The logical page names SN5600 "128-port 400 GbE"; the hardware page names SN5610 "64 total ports of 800 Gbps".',
    'In each plane, a leaf serves 2 rails: 1+5, 2+6, 3+7, 4+8 in the RA (rails 0+4, 1+5, 2+6, 3+7 in this app). 32 nodes share one set of 8 leaf switches.',
    'The RA has no table for single plane; the app offers dual plane only. The RA gives no cable counts; the app assumes as many uplinks as downlinks.',
  ],
}

export const NDR_H100: FabricDesign = {
  id: 'ndr-h100',
  name: 'DGX SuperPOD with DGX H100, NDR InfiniBand',
  short: 'H100 SuperPOD, NDR InfiniBand',
  source: H100_ARCH_URL,
  fabric: 'ib-ndr',
  platforms: ['h100', 'h200'],
  serverWord: 'nodes',
  serversPerSu: derived(32, 'nodes', '128 nodes ÷ 4 SU', H100_ARCH_URL),
  serversPerRack: assumed(4, 'nodes', RACK4),
  susPerGroup: 1,
  rails: derived(8, 'rails', '8 node-leaf cables for each node', H100_ARCH_URL),
  planes: 'single',
  leafRule: { kind: 'rail' },
  linkSpeed: confirmed(400, 'Gb/s', DGX_H_URL),
  leafSwitch: QM9700,
  spineSwitch: QM9700,
  rows: [{ su: 4, nodes: 128, gpus: 1024, leaf: 32, spine: 16, nodeLeafCables: 1024 }],
  reservedSlots: [],
  notes: [
    'The H100 fabric page has the same table as the B200 page (31, 63, 95, 127 nodes), which is probably a copy. The app uses the H100 architecture page: 4 SU = 128 nodes, 32 leaf, 16 spine, 1024 node-leaf cables.',
    'The pages read do not name the compute switch; the app uses QM9700 (NDR 400 Gb/s).',
    'The app uses the H100 RA for DGX H200 too.',
  ],
}

export const NDR_B200: FabricDesign = {
  id: 'ndr-b200',
  name: 'DGX SuperPOD with DGX B200, NDR InfiniBand',
  short: 'B200 SuperPOD, NDR InfiniBand',
  source: B200_FABRICS_URL,
  fabric: 'ib-ndr',
  platforms: ['b200'],
  serverWord: 'nodes',
  serversPerSu: confirmed(32, 'node slots', B200_FABRICS_URL),
  serversPerRack: assumed(4, 'nodes', RACK4),
  susPerGroup: 1,
  rails: derived(8, 'rails', '8 leaf switches for each SU', B200_FABRICS_URL),
  planes: 'single',
  leafRule: { kind: 'rail' },
  linkSpeed: confirmed(400, 'Gb/s', DGX_B_URL),
  leafSwitch: QM9700,
  spineSwitch: QM9700,
  rows: [
    { su: 1, nodes: 31, gpus: 248, leaf: 8, spine: 4, leafSpineCables: 256 },
    { su: 2, nodes: 63, gpus: 504, leaf: 16, spine: 8, leafSpineCables: 512 },
    { su: 3, nodes: 95, gpus: 760, leaf: 24, spine: 16, leafSpineCables: 768 },
    { su: 4, nodes: 127, gpus: 1016, leaf: 32, spine: 16, leafSpineCables: 1024 },
  ],
  reservedSlots: [
    {
      su: 1,
      slot: 32,
      reason: 'The RA removes one DGX for the UFM connection. The page does not say which slot; the app leaves the last slot of SU 1 empty.',
    },
  ],
  notes: [
    'The pages read do not name the compute switch; the app uses QM9700 (NDR 400 Gb/s).',
    'The table counts 4 more node-leaf cables for the UFM (252 for 1 SU); the app does not draw the UFM yet.',
  ],
}

export const GB300_XDR: FabricDesign = {
  id: 'gb300-xdr',
  name: 'DGX SuperPOD with DGX GB300, Quantum-X800 XDR InfiniBand',
  short: 'GB300 SuperPOD, XDR InfiniBand',
  source: GB300_RA_URL,
  fabric: 'ib-xdr',
  platforms: ['gb300-nvl72'],
  serverWord: 'trays',
  serversPerSu: derived(144, 'compute trays', '8 racks × 18 compute trays', GB300_RA_URL),
  serversPerRack: confirmed(18, 'compute trays', NVL72_UG_URL),
  susPerGroup: 1,
  rails: confirmed(4, 'rails', GB300_RA_URL),
  planes: 'single',
  leafRule: { kind: 'rail-split', split: 72 },
  linkSpeed: confirmed(800, 'Gb/s', GB300_RA_URL),
  leafSwitch: Q3400,
  spineSwitch: Q3400,
  rows: [
    { su: 2, nodes: 288, gpus: 1152, leaf: 16, spine: 8 },
    { su: 4, nodes: 576, gpus: 2304, leaf: 32, spine: 18 },
    { su: 8, nodes: 1152, gpus: 4608, leaf: 64, spine: 36 },
    { su: 16, nodes: 2304, gpus: 9216, leaf: 128, spine: 72 },
  ],
  reservedSlots: [],
  notes: [
    'The RA gives 2 leaf switches for each rail. It does not say which trays use which leaf; the app puts racks 1-4 on the first and racks 5-8 on the second.',
    'The RA gives no cable counts; the app assumes as many uplinks as downlinks on each leaf.',
  ],
}

export const GB200_RACK: FabricDesign = {
  id: 'gb200-rack',
  name: 'GB200 NVL72, one rack (the SuperPOD fabric comes in a later version)',
  short: 'GB200 NVL72, one rack',
  source: NVL72_UG_URL,
  fabric: 'ib-ndr',
  platforms: ['gb200-nvl72'],
  serverWord: 'trays',
  serversPerSu: confirmed(18, 'compute trays', NVL72_UG_URL),
  serversPerRack: confirmed(18, 'compute trays', NVL72_UG_URL),
  susPerGroup: 1,
  rails: confirmed(4, 'rails (4 ConnectX-7 for each tray)', NVL72_UG_URL),
  planes: 'single',
  leafRule: { kind: 'none' },
  linkSpeed: confirmed(400, 'Gb/s', NVL72_UG_URL),
  leafSwitch: QM9700,
  spineSwitch: QM9700,
  rows: [{ su: 1, nodes: 18, gpus: 72, leaf: 0, spine: 0 }],
  reservedSlots: [],
  notes: [
    `The GB200 SuperPOD has 8 racks in each SU and a third (core) switch layer (${GB200_ARCH_URL}). This version shows one rack and no scale-out fabric.`,
  ],
}

export const DESIGNS: FabricDesign[] = [B300_XDR, B300_SPX, ENT_B300, NDR_H100, NDR_B200, GB300_XDR, GB200_RACK]

export function designById(id: DesignId): FabricDesign {
  const d = DESIGNS.find((x) => x.id === id)
  if (!d) throw new Error(`No design ${id}`)
  return d
}

export function raRow(design: FabricDesign, su: number): RaRow | undefined {
  return design.rows.find((r) => r.su === su)
}

// The leaf switches of one group that the leaf rule needs.
export function leafCount(design: FabricDesign): number {
  const planes = design.planes === 'dual' ? 2 : 1
  const rule = design.leafRule
  switch (rule.kind) {
    case 'rail':
      return design.rails.value * planes
    case 'rail-pairs':
      return rule.pairs * planes
    case 'rail-split':
      return design.rails.value * 2
    case 'none':
      return 0
  }
}
