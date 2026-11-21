import { assumed, confirmed, derived, notSourced, type Fact } from './fact'
import type { DesignId } from './kinds'
import { NVL72 } from './nvl72'
import type { Platform } from './platforms'
import type { Switch } from './switches'
import {
  B200_ARCH_URL,
  B300_DC_GUIDE_URL,
  DGX_B300_UG_URL,
  GB300_RA_URL,
  H100_ARCH_URL,
  NDR_CABLING_URL,
  NVL72_ENT_URL,
  NVL72_UG_URL,
  Q3400_CABLES_URL,
  QM9700_CABLES_URL,
  SN5610_URL,
  SPX_ARCH_URL,
  XDR_BOM_URL,
  XDR_RA_URL,
} from './urls'

// The facts of the racks, from docs/superpowers/specs/2026-10-12-ai-factory-explorer-m2b2-sourcing.md.
export type Face = 'front' | 'rear'
export type RackRole = 'compute' | 'network' | 'spine' | 'cdu'

export type RackFacts = {
  height: Fact<number> // U
  pdus: Fact<number> // 2U PDUs at the top of a compute rack
  shelves?: Fact<number> // 1U power shelves at the top of a compute rack (the NVL72 trays have their own order)
  power: Fact<number | null> // one compute rack, kW
  nodeLeafCable: Fact<string | null>
  leafSpineCable: Fact<string | null>
}

const H48 = confirmed(48, 'U', B300_DC_GUIDE_URL, 'The B300 data center guide: "48U Height 2236mm".')
const H48_ASSUMED = assumed(48, 'U', 'No page read gives the rack height for this design; the app draws the 48U rack of the B300 data center guide.', B300_DC_GUIDE_URL)
const PDU3_ASSUMED = assumed(3, '2U PDUs', 'No page read gives the PDUs of this rack; the app draws the three 2U PDUs of the B300 XDR RA.', XDR_RA_URL)
const NO_PDU = derived(0, '2U PDUs', 'the 8 power shelves of the rack feed the trays', NVL72_UG_URL)
const NDR_NODE = assumed(
  'finned twin-port OSFP transceiver at the switch (for example MMA4Z00-NS: 2 × 400G SR4, multimode, 50 m), flat OSFP at the adapter, multimode fiber',
  undefined,
  'The H100 and B200 RA pages read give no cable parts. The NDR cabling guide says that finned twin-port OSFPs go in switch ports and flat OSFPs in adapters.',
  NDR_CABLING_URL,
)
const NDR_UP = assumed(
  'finned twin-port OSFP transceivers at both ends (for example MMA4Z00-NS), multimode fiber',
  undefined,
  'The RA pages read give no cable parts. The leaves and the spines are in different racks, so the app assumes fiber.',
  NDR_CABLING_URL,
)
const NO_PARTS = notSourced('The pages read give no cable or transceiver parts for this design.')
const GB300_PARTS = notSourced('The GB300 RA gives no cable parts. The B300 XDR RA uses twin-port OSFP transceivers and multimode fiber.')
const NO_FABRIC = notSourced('This version has no scale-out fabric for GB200.')

export const RACKS: Record<DesignId, RackFacts> = {
  'b300-xdr': {
    height: H48,
    pdus: confirmed(3, '2U PDUs', XDR_RA_URL, 'The RA: "three (3) 2U rack PDUs".'),
    power: confirmed(
      56,
      'kW (about)',
      XDR_RA_URL,
      'CONFLICT: the B300 Spectrum-X RA says "exceeds 50 kW"; the B300 data center guide says 58 kW average and 76 kW peak for a rack of 4 systems.',
    ),
    nodeLeafCable: confirmed(
      'twin-port OSFP flat-top transceiver at the server (980-9IATO-00XM00), twin-port OSFP at the leaf (980-9IAH1-00XM00), multimode fiber (980-9I570-00N030)',
      undefined,
      XDR_BOM_URL,
      'The RA parts list "must be finalized based on actual design".',
    ),
    leafSpineCable: confirmed('twin-port OSFP at both ends (980-9IAH1-00XM00), multimode fiber (980-9I570-00N030)', undefined, XDR_BOM_URL),
  },
  'b300-spx': {
    height: H48,
    pdus: derived(0, '2U PDUs', 'a rear DC busbar and 1U power shelves feed the high-density rack', B300_DC_GUIDE_URL),
    shelves: confirmed(4, '1U DC power shelves of 33 kW', B300_DC_GUIDE_URL, 'The data center guide: "Four 1U 33kW DC Power Shelves per Rack".'),
    power: confirmed(50, 'kW (more than)', SPX_ARCH_URL, 'The RA says that the rack power "exceeds 50 kW".'),
    nodeLeafCable: NO_PARTS,
    leafSpineCable: NO_PARTS,
  },
  'ent-b300': {
    height: H48_ASSUMED,
    pdus: PDU3_ASSUMED,
    power: notSourced('The Enterprise RA pages read give no rack power.'),
    nodeLeafCable: NO_PARTS,
    leafSpineCable: NO_PARTS,
  },
  'ndr-h100': {
    height: H48_ASSUMED,
    pdus: PDU3_ASSUMED,
    power: confirmed(40, 'kW (more than)', H100_ARCH_URL, 'The RA says that the rack power "exceeds 40 kW".'),
    nodeLeafCable: NDR_NODE,
    leafSpineCable: NDR_UP,
  },
  'ndr-b200': {
    height: H48_ASSUMED,
    pdus: PDU3_ASSUMED,
    power: confirmed(25, 'kW (more than)', B200_ARCH_URL, 'The RA says that the rack power "exceeds 25 kW".'),
    nodeLeafCable: NDR_NODE,
    leafSpineCable: NDR_UP,
  },
  'gb300-xdr': {
    height: H48_ASSUMED,
    pdus: NO_PDU,
    power: confirmed(142, 'kW (up to)', NVL72_ENT_URL, 'The NVL72 AI factory page: "Full rack requiring up to 142 kW."'),
    nodeLeafCable: GB300_PARTS,
    leafSpineCable: GB300_PARTS,
  },
  'gb200-rack': { height: H48_ASSUMED, pdus: NO_PDU, power: NVL72.rackPower, nodeLeafCable: NO_FABRIC, leafSpineCable: NO_FABRIC },
}

export const NETWORK_RACK = {
  placement: assumed(
    'in network racks apart from the compute racks',
    undefined,
    'No page gives the rack of a leaf or a spine. The XDR RA counts 48 racks for "Switches and Management" at 8 SU, and the B300 data center guide draws "Network Management & Storage Racks"; the app puts the leaves of each group, and the spines, in their own racks.',
    XDR_RA_URL,
  ),
  pdus: assumed(3, '2U PDUs', 'No page read gives the PDUs of a network rack; the app draws three 2U PDUs.'),
  maxSwitches: assumed(10, 'switches', 'The app puts at most 10 switches in a network rack, for the picture.'),
}

export const RACK_LAYOUT = {
  uPositions: assumed(
    'servers and switches from U1 up; the power feed at the top',
    undefined,
    'No page gives the U positions. The app stacks the servers and the switches from U1, and puts the PDUs or the power shelves at the top. An NVL72 rack keeps the tray order of the 2a rack view.',
  ),
  manifold: assumed('at the rear of each compute rack', undefined, 'No page read gives the position of the manifold; the app draws it at the rear.', NVL72_UG_URL),
  cdu: assumed('one in-row CDU for each SU', undefined, 'No page read names the CDU or gives its position; the app draws one in-row CDU for each SU.'),
}

export type SwitchPortFacts = { format: Fact<string>; face: Fact<Face> }

const FRONT_ASSUMED = assumed<Face>('front', undefined, 'The pages read do not say; the app draws the switch cages at the front.')

export const SWITCH_PORTS: Record<'q3400' | 'qm9700' | 'sn5600', SwitchPortFacts> = {
  q3400: {
    format: confirmed('sw<cage>p<1 or 2>', undefined, Q3400_CABLES_URL, 'The guide: "Each OSFP cage physically holds two separate ports that are labeled sw1p1 and sw1p2 (for cage 1)."'),
    face: FRONT_ASSUMED,
  },
  qm9700: {
    format: assumed(
      '1/<cage>/<1 or 2>',
      undefined,
      'The guide gives the x/y/z notation and says that "each cage in the system\'s front panel holds two ports"; the app reads y as the cage and z as the port of the cage.',
      QM9700_CABLES_URL,
    ),
    face: confirmed<Face>('front', undefined, QM9700_CABLES_URL, 'The guide: "each cage in the system\'s front panel holds two ports".'),
  },
  sn5600: {
    format: assumed('swp<cage>s<0 or 1>', undefined, 'Cumulus Linux names a split port swpNsM; the pages read do not give it. Each 800GbE port is split into 2 × 400GbE.', SN5610_URL),
    face: FRONT_ASSUMED,
  },
}

export function switchPortFacts(sw: Switch): SwitchPortFacts {
  const f = (SWITCH_PORTS as Partial<Record<Switch['id'], SwitchPortFacts>>)[sw.id]
  if (!f) throw new Error(`No port names for ${sw.id}`)
  return f
}

export const PORT_FACES = {
  dgxB300: confirmed<Face>('front', undefined, DGX_B300_UG_URL, 'The user guide: "All I/O connectivity is moved to the front of the system".'),
  nvl72: confirmed<Face>('front', undefined, GB300_RA_URL, 'The GB300 RA: "All network ports are located at the front-side of the rack".'),
  other: assumed<Face>('rear', undefined, 'The pages read show the port side in figures only; the app draws the compute ports at the rear.'),
}

// The side of the rack where the compute ports of a server or tray are.
export function portFaceOf(p: Platform): Fact<Face> {
  if (p.form === 'nvl72-tray') return PORT_FACES.nvl72
  if (p.family === 'b300' && p.build === 'dgx') return PORT_FACES.dgxB300
  return PORT_FACES.other
}
