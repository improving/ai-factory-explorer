import type cytoscape from 'cytoscape'
import type { BlockRole } from '../catalog/factory'
import type { Graph } from '../topology/graph'

type El = cytoscape.ElementDefinition

// Five columns, so the overview fits a narrow canvas at a zoom that keeps the labels readable.
// Column A: storage; B: automation, the VIP, Rafay, the compute fabric; C: the north-south path down to
// the pods and the power; D and E: the enterprise services, the control plane, and the managers.
// Rows from top to bottom: the edge, the networks, the control plane, the storage and compute, the facility.
const COL = { A: 0, B: 230, C: 460, D: 690, E: 920, F: 1150 }
const ROW = (r: number) => r * 110
const POS: Record<BlockRole, { x: number; y: number }> = {
  internet: { x: COL.C, y: ROW(0) },
  dns: { x: COL.E, y: ROW(0) },
  router: { x: COL.C, y: ROW(1) },
  'rafay-saas': { x: COL.D, y: ROW(1) },
  ntp: { x: COL.E, y: ROW(1) },
  lb: { x: COL.B, y: ROW(2) },
  firewall: { x: COL.C, y: ROW(2) },
  ipam: { x: COL.E, y: ROW(2) },
  netris: { x: COL.A, y: ROW(3) },
  frontend: { x: COL.C, y: ROW(3) },
  'control-net': { x: COL.D, y: ROW(3) },
  'oob-net': { x: COL.E, y: ROW(3) },
  'storage-net': { x: COL.A, y: ROW(4) },
  rafay: { x: COL.B, y: ROW(4) },
  k8s: { x: COL.D, y: ROW(4) },
  slurm: { x: COL.E, y: ROW(4) },
  vast: { x: COL.A, y: ROW(5) },
  bcm: { x: COL.D, y: ROW(5) },
  'mission-control': { x: COL.D, y: ROW(5) },
  ufm: { x: COL.E, y: ROW(5) },
  ceph: { x: COL.A, y: ROW(6) },
  'compute-fabric': { x: COL.B, y: ROW(6) },
  linstor: { x: COL.A, y: ROW(7) },
  pods: { x: COL.C, y: ROW(7) },
  spares: { x: COL.D, y: ROW(7) },
  utility: { x: COL.A, y: ROW(8) },
  ups: { x: COL.B, y: ROW(8) },
  pdu: { x: COL.C, y: ROW(8) },
  cdu: { x: COL.D, y: ROW(8) },
  bms: { x: COL.E, y: ROW(8) },
  prometheus: { x: COL.F, y: ROW(5) },
  alertmanager: { x: COL.F, y: ROW(6) },
  itsm: { x: COL.F, y: ROW(7) },
  siem: { x: COL.F, y: ROW(8) },
  generator: { x: COL.A, y: ROW(9) },
}

export function overviewElements(g: Graph): El[] {
  const out: El[] = []
  for (const n of g.nodes) {
    const role = n.role!
    out.push({ group: 'nodes', data: { id: n.id, label: n.label, kind: 'block', role }, position: POS[role], classes: `block ${role}` })
  }
  for (const e of g.edges) {
    out.push({
      group: 'edges',
      data: { id: e.id, source: e.source, target: e.target, kind: 'link', network: e.network, label: e.label },
      classes: `ov ${e.network}`,
    })
  }
  return out
}
