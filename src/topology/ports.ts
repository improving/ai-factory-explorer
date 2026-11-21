import { designById } from '../catalog/designs'
import { platformFor } from '../catalog/platforms'
import type { Switch } from '../catalog/switches'
import type { Config } from '../config/config'
import { fabricShape, leafIndexFor, leavesOf, type FabricShape, type LeafInfo } from './fabric'
import type { GraphEdge } from './graph'
import { leafId, parseServerId, serverPortId, suOf, switchPortId } from './ids'

// One end of a cable: the device, the port id, the port name, the port number (the rail for a
// server), and the NIC name when a user guide gives it.
export type PortEnd = { device: string; id: string; label: string; n: number; name: string | null }

export const PORT_ASSIGNMENT_NOTE =
  'No page read gives the switch port of each cable. The app numbers the downlinks of a leaf in slot order, then its uplinks, and the ports of a spine in leaf order.'

// The name of switch port n (1-based). Each OSFP cage holds two ports.
export function switchPortLabel(sw: Switch, n: number): string {
  const cage = Math.ceil(n / 2)
  const sub = ((n - 1) % 2) + 1
  switch (sw.id) {
    case 'q3400':
      return `sw${cage}p${sub}`
    case 'qm9700':
      return `1/${cage}/${sub}`
    case 'sn5600':
      return `swp${cage}s${sub - 1}`
    default:
      return `port ${n}`
  }
}

// The switch model of a leaf or a spine id, or null for any other device.
export function switchOf(config: Config, device: string): Switch | null {
  const d = designById(config.design)
  if (device.includes('-leaf-')) return d.leafSwitch
  if (/^spine-\d+$/.test(device)) return d.spineSwitch
  return null
}

// The downlink port of each slot, rail, and plane on its leaf. It depends only on the design and
// the topology, so it is built once for each pair.
const downCache = new Map<string, Map<string, number>>()
function downPorts(shape: FabricShape, topology: Config['topology']): Map<string, number> {
  const key = `${shape.design.id}:${topology}`
  const hit = downCache.get(key)
  if (hit) return hit
  const next = new Array<number>(shape.leavesPerGroup).fill(0)
  const map = new Map<string, number>()
  for (let slot = 1; slot <= shape.slotsPerGroup; slot++) {
    for (let r = 0; r < shape.rails; r++) {
      for (let p = 0; p < shape.planeCount; p++) {
        const li = leafIndexFor(shape, topology, r, p, slot)
        next[li] = next[li]! + 1
        map.set(`${slot}:${r}:${p}`, next[li]!)
      }
    }
  }
  downCache.set(key, map)
  return map
}

// A config object never changes, so its shape is built once; cableEnds runs for every cable of a rack.
const shapes = new WeakMap<Config, FabricShape>()
function shapeOf(config: Config): FabricShape {
  let shape = shapes.get(config)
  if (!shape) {
    shape = fabricShape(config)
    shapes.set(config, shape)
  }
  return shape
}

function leafInfo(shape: FabricShape, topology: Config['topology'], first: number, id: string): LeafInfo {
  const l = leavesOf(shape, topology, first).find((x) => leafId(first, x.tag) === id)
  if (!l) throw new Error(`No leaf ${id}`)
  return l
}

export function cableEnds(config: Config, e: GraphEdge): { a: PortEnd; b: PortEnd } {
  const shape = shapeOf(config)
  const d = shape.design
  if (e.tier === 'node-leaf') {
    const s = parseServerId(e.source)
    if (!s || e.rail === undefined) throw new Error(`${e.id} has no server end`)
    const first = Math.floor((s.su - 1) / shape.susPerGroup) * shape.susPerGroup + 1
    const slot = (s.su - first) * shape.perSu + s.n
    const plane = e.plane ?? 0
    const P = platformFor(config)
    const base = P.computePorts.value[e.rail] ?? `port ${e.rail}`
    const n = downPorts(shape, config.topology).get(`${slot}:${e.rail}:${plane}`)!
    return {
      a: {
        device: e.source,
        id: serverPortId(e.source, e.rail, plane, shape.planeCount),
        label: shape.planeCount === 2 ? `${base} P${plane + 1}` : base,
        n: e.rail,
        name: shape.planeCount === 1 ? (P.computeMlx5?.value[e.rail] ?? null) : null,
      },
      b: { device: e.target, id: switchPortId(e.target, n), label: switchPortLabel(d.leafSwitch, n), n, name: null },
    }
  }
  if (e.tier === 'leaf-spine') {
    const [leaf, spine, c] = e.id.split('~') as [string, string, string]
    const first = suOf(leaf)!
    const l = leafInfo(shape, config.topology, first, leaf)
    const j = Number(spine.slice('spine-'.length))
    const k = Number(c)
    const perPlane = shape.leavesPerGroup / shape.planeCount
    const group = (first - 1) / shape.susPerGroup // 0-based
    const firstSpine = l.plane * shape.spinesPerPlane + 1
    const up = shape.downPerLeaf + (j - firstSpine) * shape.perPair + k
    const sp = group * perPlane * shape.perPair + (l.index - l.plane * perPlane) * shape.perPair + k
    return {
      a: { device: leaf, id: switchPortId(leaf, up), label: switchPortLabel(d.leafSwitch, up), n: up, name: null },
      b: { device: spine, id: switchPortId(spine, sp), label: switchPortLabel(d.spineSwitch, sp), n: sp, name: null },
    }
  }
  throw new Error(`${e.id} is not a compute fabric cable`)
}
