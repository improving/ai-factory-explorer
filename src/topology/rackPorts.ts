import { formatFact } from '../catalog/fact'
import { platformFor } from '../catalog/platforms'
import { RACKS, portFaceOf, switchPortFacts } from '../catalog/racks'
import type { Config } from '../config/config'
import { fabricShape, generateFabric } from './fabric'
import type { Graph, GraphEdge, GraphNode } from './graph'
import { serverPortId, switchPortId } from './ids'
import { cableEnds, switchOf, switchPortLabel, type PortEnd } from './ports'
import { layoutOf, rackOf } from './racks'
import { FINDING_LABEL, type Diff } from './sources'

export type PortMapEnd = { id: string; device: string; rack: string; u: number; port: string; nic: string }
export type PortMapRow = { cable: string; a: PortMapEnd; b: PortMapEnd; type: string }

type RackCable = { e: GraphEdge; local: PortEnd; far: PortEnd }

// A config object never changes, so its fabric is built once for the rack levels and the port map.
const fabrics = new WeakMap<Config, Graph>()
function fabricOf(config: Config): Graph {
  let g = fabrics.get(config)
  if (!g) {
    g = generateFabric(config)
    fabrics.set(config, g)
  }
  return g
}

// The compute fabric cables with an end on a device of the rack, with the local end first.
function rackCables(config: Config, rackId: string): RackCable[] {
  const here = new Set(layoutOf(config).devices.filter((x) => x.rack === rackId).map((x) => x.id))
  const out: RackCable[] = []
  for (const e of fabricOf(config).edges) {
    if (!here.has(e.source) && !here.has(e.target)) continue
    const { a, b } = cableEnds(config, e)
    out.push(here.has(a.device) ? { e, local: a, far: b } : { e, local: b, far: a })
  }
  return out
}

// One rack with all the ports of its devices. A compute rack also shows the far end of each cable:
// the leaf and its port, in its network rack. A network or spine rack has too many cables to draw;
// the port map and the inspector give their far ends.
export function generateRackPorts(config: Config, rackId: string): Graph {
  const rack = rackOf(config, rackId)
  if (!rack) throw new Error(`No rack ${rackId}`)
  const layout = layoutOf(config)
  const shape = fabricShape(config)
  const P = platformFor(config)
  const serverFace = portFaceOf(P).value
  const cables = rackCables(config, rackId)
  const byPort = new Map(cables.map((c) => [c.local.id, c]))
  const nodes: GraphNode[] = [
    { id: rack.id, kind: 'rack', label: rack.label, su: rack.su, rackRole: rack.role, ru: RACKS[shape.design.id].height.value },
  ]
  const edges: GraphEdge[] = []

  for (const x of layout.devices.filter((y) => y.rack === rackId)) {
    nodes.push({ id: x.id, kind: x.kind, label: x.label, parent: rackId, u: x.u, ru: x.ru, face: x.face })
    if (x.kind === 'server') {
      for (let r = 0; r < shape.rails; r++) {
        for (let p = 0; p < shape.planeCount; p++) {
          const id = serverPortId(x.id, r, p, shape.planeCount)
          const base = P.computePorts.value[r] ?? `port ${r}`
          const name = shape.planeCount === 1 ? P.computeMlx5?.value[r] : undefined
          nodes.push({
            id,
            kind: 'port',
            label: shape.planeCount === 2 ? `${base} P${p + 1}` : base,
            parent: rackId,
            device: x.id,
            rail: r,
            plane: p,
            index: r * shape.planeCount + p,
            network: 'compute',
            face: serverFace,
            used: byPort.has(id),
            ...(name ? { name } : {}),
          })
        }
      }
    }
    const sw = switchOf(config, x.id)
    if (sw) {
      const face = switchPortFacts(sw).face.value
      for (let n = 1; n <= sw.ports.value; n++) {
        const id = switchPortId(x.id, n)
        const c = byPort.get(id)
        nodes.push({
          id,
          kind: 'port',
          label: switchPortLabel(sw, n),
          parent: rackId,
          device: x.id,
          index: n,
          network: 'compute',
          face,
          used: c !== undefined,
          ...(c?.e.rail === undefined ? {} : { rail: c.e.rail }),
        })
      }
    }
  }

  if (rack.role === 'compute') {
    const farLeaves = new Set<string>()
    for (const c of cables) {
      const spot = layout.spot.get(c.far.device)
      if (!farLeaves.has(c.far.device)) {
        farLeaves.add(c.far.device)
        const where = spot ? ` (${rackOf(config, spot.rack)?.label ?? spot.rack}, U${spot.u})` : ''
        nodes.push({ id: c.far.device, kind: 'leaf', label: `${spot?.label ?? c.far.device}${where}`, far: true, face: 'both' })
      }
      nodes.push({
        id: c.far.id,
        kind: 'port',
        label: c.far.label,
        device: c.far.device,
        index: c.far.n,
        network: 'compute',
        face: 'both',
        far: true,
        used: true,
        ...(c.e.rail === undefined ? {} : { rail: c.e.rail }),
      })
      edges.push({ ...c.e, source: c.local.id, target: c.far.id })
    }
  }
  return { nodes, edges }
}

export function portMapRows(config: Config, rackId: string): PortMapRow[] {
  const layout = layoutOf(config)
  const facts = RACKS[fabricShape(config).design.id]
  const end = (p: PortEnd): PortMapEnd => {
    const x = layout.spot.get(p.device)
    return { id: p.id, device: p.device, rack: x?.rack ?? '', u: x?.u ?? 0, port: p.label, nic: p.name ?? '' }
  }
  return rackCables(config, rackId).map(({ e, local, far }) => ({
    cable: e.id,
    a: end(local),
    b: end(far),
    type: formatFact(e.tier === 'leaf-spine' ? facts.leafSpineCable : facts.nodeLeafCable),
  }))
}

const HEADER = ['Cable', 'A device', 'A rack', 'A U', 'A port', 'A NIC', 'B device', 'B rack', 'B U', 'B port', 'B NIC', 'Cable and optics']
const cell = (v: string | number): string => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// The port map as CSV, to compare with ibnetdiscover (M3 lab step 5). With a source, the CSV carries the finding
// of each cable and the far end that the source gives, so the comparison goes in the change record.
export function portMapCsv(rows: PortMapRow[], diff?: Diff | null): string {
  const byEnd = new Map<string, Diff['rows'][number]>()
  for (const r of diff?.rows ?? []) {
    byEnd.set(r.near, r)
    if (r.far) byEnd.set(r.far, r)
    if (r.sourceFar) byEnd.set(r.sourceFar, r)
  }
  const line = (r: PortMapRow) => {
    const base = [r.cable, r.a.device, r.a.rack, r.a.u, r.a.port, r.a.nic, r.b.device, r.b.rack, r.b.u, r.b.port, r.b.nic, r.type]
    if (!diff) return base
    const d = byEnd.get(r.a.id) ?? byEnd.get(r.b.id)
    return [...base, d ? FINDING_LABEL[d.finding] : '', d?.sourceFar ?? '']
  }
  const extras = (diff?.rows ?? [])
    .filter((r) => r.finding === 'extra')
    .map((r) => ['', r.near.split('/')[0] ?? '', '', r.near.split('/')[1] ?? '', '', '', r.sourceFar?.split('/')[0] ?? '', '', '', r.sourceFar?.split('/')[1] ?? '', '', '', FINDING_LABEL.extra, r.sourceFar ?? ''])
  const header = diff ? [...HEADER, 'Difference', 'Source far end'] : HEADER
  return `${[header, ...rows.map(line), ...extras].map((l) => l.map(cell).join(',')).join('\n')}\n`
}
