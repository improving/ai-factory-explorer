import type cytoscape from 'cytoscape'
import type { Face } from '../catalog/racks'
import type { Graph, GraphNode } from '../topology/graph'

type El = cytoscape.ElementDefinition

const PER_ROW = 8 // racks in one row of the elevation
const RACK_GAP = 300
const ROW_GAP = 160
const shows = (n: GraphNode, face: Face) => n.face === undefined || n.face === 'both' || n.face === face

const mark = (id: string, parent: string, label: string, x: number, y: number): El => ({
  group: 'nodes',
  data: { id, parent, label, kind: 'umark' },
  position: { x, y },
  classes: 'umark',
  selectable: false,
})

// One device box: its centre from its U position, 1 U = uPx pixels, U1 at the bottom.
function device(n: GraphNode, x0: number, y0: number, top: number, uPx: number, width: number): El {
  const side = n.ru === 0 // a manifold: beside the U positions, the full height
  const h = side ? top * uPx : n.ru! * uPx - 2
  const y = side ? y0 + (top * uPx) / 2 : y0 + (top - (n.u! + n.ru! - 1)) * uPx + (n.ru! * uPx) / 2
  // The label grows with the device, so a 1U label hides at a small zoom instead of covering its neighbours.
  const fs = side ? 6 : Math.min(22, Math.max(6, n.ru! * uPx * 0.8))
  return {
    group: 'nodes',
    data: { id: n.id, parent: n.parent, label: side ? '' : n.label, kind: n.kind, w: side ? 10 : width, h, fs },
    position: { x: side ? x0 + width / 2 + 14 : x0, y },
    classes: `device ${n.kind}`,
  }
}

// Level 3a: the racks of one SU, without ports, in rows of 8.
export function racksElements(g: Graph, face: Face): El[] {
  const U = 12
  const out: El[] = []
  g.nodes
    .filter((n) => n.kind === 'rack')
    .forEach((r, i) => {
      const top = r.ru ?? 48
      const x0 = (i % PER_ROW) * RACK_GAP
      const y0 = Math.floor(i / PER_ROW) * (top * U + ROW_GAP)
      if (r.rackRole === 'cdu') {
        out.push({ group: 'nodes', data: { id: r.id, label: r.label, kind: 'cdu', w: 180, h: top * U }, position: { x: x0, y: y0 + (top * U) / 2 }, classes: 'cdu-rack' })
        return
      }
      out.push({ group: 'nodes', data: { id: r.id, label: r.label, kind: 'rack' }, classes: `erack ${r.rackRole}` })
      out.push(mark(`${r.id}/u-top`, r.id, `U${top}`, x0 - 110, y0), mark(`${r.id}/u-1`, r.id, 'U1', x0 - 110, y0 + top * U))
      for (const n of g.nodes) if (n.parent === r.id && shows(n, face)) out.push(device(n, x0, y0, top, U, 180))
    })
  return out
}

// Level 3b: one rack at a larger scale, with its ports; for a compute rack, the far leaves on the right.
export function rackPortsElements(g: Graph, face: Face): El[] {
  const U = 28
  const W = 600
  const rack = g.nodes.find((n) => n.kind === 'rack')!
  const top = rack.ru ?? 48
  const out: El[] = [
    { group: 'nodes', data: { id: rack.id, label: rack.label, kind: 'rack' }, classes: `erack ${rack.rackRole}` },
    mark(`${rack.id}/u-top`, rack.id, `U${top}`, -W / 2 - 30, 0),
    mark(`${rack.id}/u-1`, rack.id, 'U1', -W / 2 - 30, top * U),
  ]
  const boxes = new Map<string, El>()
  for (const n of g.nodes) {
    if (n.parent !== rack.id || n.kind === 'port' || !shows(n, face)) continue
    const el = device(n, 0, 0, top, U, W)
    boxes.set(n.id, el)
    out.push(el)
  }

  const portClass = (p: GraphNode) => `rport${p.used ? '' : ' unused'}${p.far ? ' far' : ''}${p.rail === undefined ? '' : ` rail-${p.rail}`}`
  const local = g.nodes.filter((n) => n.kind === 'port' && !n.far)
  const drawn = new Set<string>()
  const perDevice = new Map<string, GraphNode[]>()
  for (const p of local) perDevice.set(p.device!, [...(perDevice.get(p.device!) ?? []), p])
  for (const [dev, ports] of perDevice) {
    const box = boxes.get(dev)
    if (!box) continue
    const cy = box.position!.y
    const h = Number(box.data.h)
    if (!/-leaf-|^spine-/.test(dev)) {
      // The compute ports of a server or a tray (at most 16): one row.
      ports.forEach((p, i) => {
        if (!shows(p, face)) return
        drawn.add(p.id)
        // The plane letter is in the port id only for dual plane; P1 and P2 of a single-plane name are sub-ports.
        const plane = /port-c\d+([AB])$/.exec(p.id)?.[1] ?? ''
        // The spec: each port shows its rail number. The inspector gives the full port name.
        out.push({ group: 'nodes', data: { id: p.id, label: `r${p.rail}${plane}`, kind: 'port', device: dev, w: 32, h: Math.min(24, h - 4), fs: 18 }, position: { x: -W / 2 + 40 + i * 36, y: cy }, classes: portClass(p) })
      })
      continue
    }
    // The ports of a switch: two ports in each cage, the cages in rows of at most 36. They are too small for a
    // label; the rail colour shows the rail, and the inspector gives the port name.
    const cages = ports.length / 2
    const perRow = Math.ceil(cages / Math.ceil(cages / 36))
    const rows = 2 * Math.ceil(cages / perRow)
    const cw = (W - 40) / perRow
    const ch = h / rows
    for (const p of ports) {
      if (!shows(p, face)) continue
      const n = p.index!
      const cage = Math.ceil(n / 2)
      const col = (cage - 1) % perRow
      const row = Math.floor((cage - 1) / perRow) * 2 + ((n - 1) % 2)
      drawn.add(p.id)
      out.push({
        group: 'nodes',
        data: { id: p.id, label: '', kind: 'port', device: dev, w: Math.max(4, cw - 2), h: Math.max(4, Math.min(10, ch - 2)), fs: 6 },
        position: { x: -W / 2 + 20 + col * cw + cw / 2, y: cy - h / 2 + row * ch + ch / 2 },
        classes: portClass(p),
      })
    }
  }

  // The far leaves of a compute rack: one box for each leaf, with the ports that this rack uses.
  const shown = g.edges.filter((e) => drawn.has(e.source))
  const farPorts = new Set(shown.map((e) => e.target))
  let y = 0
  for (const leaf of g.nodes.filter((n) => n.far && n.kind !== 'port')) {
    const ports = g.nodes.filter((n) => n.far && n.kind === 'port' && n.device === leaf.id && farPorts.has(n.id))
    if (ports.length === 0) continue
    const rows = Math.ceil(ports.length / 6)
    const h = 56 + rows * 30
    const cx = W / 2 + 360
    out.push({ group: 'nodes', data: { id: leaf.id, label: leaf.label, kind: 'leaf', w: 400, h, fs: 18 }, position: { x: cx, y: y + h / 2 }, classes: 'device leaf far' })
    ports.forEach((p, i) => {
      out.push({
        group: 'nodes',
        data: { id: p.id, label: p.label, kind: 'port', device: leaf.id, w: 58, h: 24, fs: 16 },
        position: { x: cx - 200 + 40 + (i % 6) * 64, y: y + 48 + Math.floor(i / 6) * 30 },
        classes: portClass(p),
      })
    })
    y += h + 24
  }
  for (const e of shown) {
    out.push({ group: 'edges', data: { id: e.id, source: e.source, target: e.target, kind: 'cable', network: 'compute', rail: e.rail }, classes: `cable${e.rail === undefined ? '' : ` rail-${e.rail}`}` })
  }
  return out
}
