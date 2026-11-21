import type { NodeKind } from '../catalog/kinds'
import { NVL72 } from '../catalog/nvl72'
import { platformFor } from '../catalog/platforms'
import { NETWORK_RACK, RACKS, type RackRole } from '../catalog/racks'
import type { Config } from '../config/config'
import { fabricShape, leavesOf } from './fabric'
import type { Graph, GraphNode } from './graph'
import { cduId, coreRackId, leafId, netRackId, rackId, serverExists, serverId, spineId } from './ids'

export type RackInfo = { id: string; role: RackRole; su: number; label: string }
export type Device = { id: string; kind: NodeKind; label: string; rack: string; u: number; ru: number; face: 'both' | 'rear' }
export type Layout = { racks: RackInfo[]; devices: Device[]; spot: Map<string, Device> }

const ROLE_ORDER: RackRole[] = ['compute', 'network', 'spine', 'cdu']
const cache = new WeakMap<Config, Layout>()

// Every rack of the configuration and every device in it. No page gives the U positions
// (RACK_LAYOUT.uPositions): the app stacks the servers and switches from U1 and puts the power feed
// at the top; an NVL72 rack keeps the tray order of the 2a rack view. A config object never changes,
// so the layout is cached for each one.
export function layoutOf(config: Config): Layout {
  const hit = cache.get(config)
  if (hit) return hit
  const shape = fabricShape(config)
  const d = shape.design
  const facts = RACKS[d.id]
  const top = facts.height.value
  const P = platformFor(config)
  const racks: RackInfo[] = []
  const devices: Device[] = []
  const put = (id: string, kind: NodeKind, label: string, rack: string, u: number, ru: number, face: Device['face'] = 'both') =>
    devices.push({ id, kind, label, rack, u, ru, face })

  // The power feed from the top of a rack down: 1U power shelves, then 2U PDUs at the rear.
  const feed = (rack: string, pdus: number, shelves: number) => {
    let u = top
    for (let k = 1; k <= shelves; k++, u--) put(`${rack}-ps${k}`, 'power-shelf', `Power shelf ${k}`, rack, u, 1)
    for (let k = 1; k <= pdus; k++, u -= 2) put(`${rack}-pdu${k}`, 'pdu', `PDU ${k}`, rack, u - 1, 2, 'rear')
  }

  const racksPerSu = shape.perSu / shape.perRack
  for (let su = 1; su <= config.suCount; su++) {
    for (let r = 1; r <= racksPerSu; r++) {
      const id = rackId(su, r)
      racks.push({ id, role: 'compute', su, label: `SU ${su} rack ${r}` })
      const slot = (k: number) => serverId(su, (r - 1) * shape.perRack + k)
      if (P.form === 'nvl72-tray') {
        // Top to bottom: half the power shelves, trays 1-10, the switch trays, the other trays, the other shelves.
        const half = NVL72.powerShelves.value / 2
        const order: [string, NodeKind, string][] = []
        for (let s = 1; s <= half; s++) order.push([`${id}-ps${s}`, 'power-shelf', `Power shelf ${s}`])
        for (let k = 1; k <= 10; k++) order.push([slot(k), 'server', slot(k)])
        for (let w = 1; w <= NVL72.switchTrays.value; w++) order.push([`${id}-sw${w}`, 'switch-tray', `Switch tray ${w}`])
        for (let k = 11; k <= shape.perRack; k++) order.push([slot(k), 'server', slot(k)])
        for (let s = half + 1; s <= NVL72.powerShelves.value; s++) order.push([`${id}-ps${s}`, 'power-shelf', `Power shelf ${s}`])
        order.forEach(([dev, kind, label], i) => {
          if (kind !== 'server' || serverExists(config, dev)) put(dev, kind, label, id, top - i, 1)
        })
      } else {
        feed(id, facts.pdus.value, facts.shelves?.value ?? 0)
        const ru = P.rackUnits.value
        if (ru === null) throw new Error(`No rack units for ${P.name}`)
        for (let k = 1; k <= shape.perRack; k++) {
          if (serverExists(config, slot(k))) put(slot(k), 'server', slot(k), id, 1 + (k - 1) * ru, ru)
        }
      }
      if (config.cooling === 'liquid') put(`${id}-manifold`, 'manifold', 'Manifold', id, 1, 0, 'rear')
    }
    if (config.cooling === 'liquid') racks.push({ id: cduId(su), role: 'cdu', su, label: `SU ${su} CDU (in-row)` })
  }

  // The switches of one kind, from U1 up, at most NETWORK_RACK.maxSwitches in each rack.
  const pack = (parts: { id: string; label: string }[], kind: NodeKind, ru: number, info: (k: number) => RackInfo) => {
    const room = Math.floor((top - 2 * NETWORK_RACK.pdus.value) / ru)
    const per = Math.min(room, NETWORK_RACK.maxSwitches.value)
    parts.forEach((part, i) => {
      const rack = info(Math.floor(i / per) + 1)
      if (i % per === 0) {
        racks.push(rack)
        feed(rack.id, NETWORK_RACK.pdus.value, 0)
      }
      put(part.id, kind, part.label, rack.id, 1 + (i % per) * ru, ru)
    })
  }
  if (shape.leavesPerGroup > 0) {
    for (let g = 1; g <= shape.groups; g++) {
      const first = (g - 1) * shape.susPerGroup + 1
      const last = first + shape.susPerGroup - 1
      const sus = last > first ? `SUs ${first}-${last}` : `SU ${first}`
      const leaves = leavesOf(shape, config.topology, first).map((l) => ({ id: leafId(first, l.tag), label: l.label }))
      pack(leaves, 'leaf', d.leafSwitch.rackUnits.value, (k) => ({ id: netRackId(first, k), role: 'network', su: first, label: `Network rack ${k} (leaves of ${sus})` }))
    }
    const spines = Array.from({ length: shape.row.spine }, (_, i) => ({ id: spineId(i + 1), label: `Spine ${i + 1}` }))
    pack(spines, 'spine', d.spineSwitch.rackUnits.value, (k) => ({ id: coreRackId(k), role: 'spine', su: 0, label: `Spine rack ${k} (all SUs)` }))
  }

  const layout = { racks, devices, spot: new Map(devices.map((x) => [x.id, x])) }
  cache.set(config, layout)
  return layout
}

// The racks that the elevation of one SU shows: its compute racks, the network racks of its group,
// the spine racks, and its CDU.
export function racksOfSu(config: Config, su: number): RackInfo[] {
  const g = fabricShape(config).susPerGroup
  const first = Math.floor((su - 1) / g) * g + 1
  const mine = (r: RackInfo) => (r.role === 'network' ? r.su === first : r.role === 'spine' ? true : r.su === su)
  return layoutOf(config)
    .racks.filter(mine)
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
}

export const rackOf = (config: Config, id: string): RackInfo | undefined => layoutOf(config).racks.find((r) => r.id === id)

export function generateRacks(config: Config, su: number): Graph {
  const racks = racksOfSu(config, su)
  const top = RACKS[fabricShape(config).design.id].height.value
  const ids = new Set(racks.map((r) => r.id))
  const nodes: GraphNode[] = racks.map((r) => ({ id: r.id, kind: 'rack', label: r.label, su: r.su, rackRole: r.role, ru: top }))
  for (const x of layoutOf(config).devices) {
    if (ids.has(x.rack)) nodes.push({ id: x.id, kind: x.kind, label: x.label, parent: x.rack, u: x.u, ru: x.ru, face: x.face })
  }
  return { nodes, edges: [] }
}
