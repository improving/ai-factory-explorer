import type cytoscape from 'cytoscape'
import type { Graph, GraphEdge } from '../topology/graph'
import { anchorId } from '../topology/ids'

export const LAYOUT = { rackW: 44, leafW: 96, slotH: 40, gap: 120, spineY: 0, anchorY: 170, leafY: 260, planeDy: 44, serverDy: 140, closedDy: 200 }

type El = cytoscape.ElementDefinition
const railClasses = (rails: number[]) => rails.map((r) => ` rail-${r}`).join('')

// Turns the fabric graph into Cytoscape elements with fixed positions.
// Spines on top; for each group (one SU, or the SUs that share leaves): its leaves (one row for each
// plane), then the group closed (one box) or open (its servers by rack). The groups go in rows.
export function fabricElements(fabric: Graph, expanded: ReadonlySet<number>): El[] {
  const groups = fabric.nodes.filter((n) => n.kind === 'su').sort((a, b) => a.su! - b.su!)
  const spines = fabric.nodes.filter((n) => n.kind === 'spine')
  const leaves = fabric.nodes.filter((n) => n.kind === 'leaf')
  const servers = fabric.nodes.filter((n) => n.kind === 'server')
  const groupOf = new Map(servers.map((s) => [s.id, s.parent!]))
  const head = groups[0]!
  const headServers = servers.filter((s) => s.parent === head.id)
  const racks = Math.max(1, ...headServers.map((s) => s.rack!))
  const perRack = Math.ceil(Math.max(1, ...headServers.map((s) => s.index!)) / racks)
  const headLeaves = leaves.filter((l) => l.su === head.su)
  const planes = headLeaves.length === 0 ? 1 : Math.max(...headLeaves.map((l) => l.plane ?? 0)) + 1
  const perPlane = Math.max(1, headLeaves.length / planes)
  const groupW = Math.max(racks * LAYOUT.rackW, perPlane * LAYOUT.leafW)
  const rackStep = groupW / racks
  const planeSpan = (planes - 1) * LAYOUT.planeDy
  const serverY = LAYOUT.leafY + planeSpan + LAYOUT.serverDy
  const closedY = LAYOUT.leafY + planeSpan + LAYOUT.closedDy
  const rowH = Math.max(480, serverY + perRack * LAYOUT.slotH + 100 - LAYOUT.anchorY)
  const perRow = Math.ceil(Math.sqrt(groups.length))
  const cols = Math.min(perRow, groups.length)
  const totalW = cols * groupW + (cols - 1) * LAYOUT.gap
  const out: El[] = []

  spines.forEach((s, j) => {
    out.push({
      group: 'nodes',
      data: { id: s.id, label: s.label, kind: 'spine' },
      position: { x: (totalW * (j + 0.5)) / spines.length, y: LAYOUT.spineY },
      classes: 'spine',
    })
  })

  groups.forEach((g, i) => {
    const x0 = (i % perRow) * (groupW + LAYOUT.gap)
    const y0 = Math.floor(i / perRow) * rowH
    const gLeaves = leaves.filter((l) => l.su === g.su).sort((a, b) => a.index! - b.index!)
    const gLeafIds = new Set(gLeaves.map((l) => l.id))
    const isTor = (rails: number[] | undefined) => (rails?.length ?? 0) > 2
    for (const leaf of gLeaves) {
      const rails = leaf.rails ?? []
      out.push({
        group: 'nodes',
        data: { id: leaf.id, label: leaf.label, kind: 'leaf', rail: leaf.rail, rails },
        position: { x: x0 + ((leaf.index! % perPlane) + 0.5) * (groupW / perPlane), y: y0 + LAYOUT.leafY + (leaf.plane ?? 0) * LAYOUT.planeDy },
        classes: `leaf${isTor(rails) ? ' tor' : railClasses(rails)}`,
      })
    }
    const uplinks = fabric.edges.filter((e) => e.tier === 'leaf-spine' && gLeafIds.has(e.source))
    const gServers = servers.filter((s) => s.parent === g.id)

    if (!expanded.has(g.su!)) {
      out.push({
        group: 'nodes',
        data: { id: g.id, label: `${g.label} · ${gServers.length} ${g.word ?? 'servers'} · double-click to open`, kind: 'su', w: groupW },
        position: { x: x0 + groupW / 2, y: y0 + closedY },
        classes: 'su closed',
      })
      if (gLeaves.length === 0) return
      for (const leaf of gLeaves) {
        const rails = leaf.rails ?? []
        const n = fabric.edges.filter((e) => e.tier === 'node-leaf' && e.target === leaf.id).length
        out.push({
          group: 'edges',
          data: { id: `${g.id}=>${leaf.id}`, source: g.id, target: leaf.id, kind: 'bundle', network: 'compute', rail: leaf.rail, count: n, label: String(n) },
          classes: `bundle${isTor(rails) ? '' : railClasses(rails)}`,
        })
      }
      const anchor = anchorId(g.su!)
      out.push({
        group: 'nodes',
        data: { id: anchor, label: '', kind: 'anchor' },
        position: { x: x0 + groupW / 2, y: y0 + LAYOUT.anchorY },
        classes: 'anchor',
        selectable: false,
      })
      for (const leaf of gLeaves) {
        const rails = leaf.rails ?? []
        out.push({
          group: 'edges',
          data: { id: `${leaf.id}=>${anchor}`, source: leaf.id, target: anchor, kind: 'stub', network: 'compute', rail: leaf.rail },
          classes: `stub${isTor(rails) ? '' : railClasses(rails)}`,
        })
      }
      for (const [spine, cables] of groupBy(uplinks, (e) => e.target)) {
        out.push({
          group: 'edges',
          data: { id: `${anchor}=>${spine}`, source: anchor, target: spine, kind: 'bundle', network: 'compute', count: cables.length, label: String(cables.length) },
          classes: 'bundle uplink',
        })
      }
      return
    }

    out.push({ group: 'nodes', data: { id: g.id, label: g.label, kind: 'su' }, classes: 'su expanded' })
    for (const s of gServers) {
      out.push({
        group: 'nodes',
        data: { id: s.id, parent: g.id, label: s.id.split('-').pop(), kind: 'server' },
        position: { x: x0 + (s.rack! - 0.5) * rackStep, y: y0 + serverY + ((s.index! - 1) % perRack) * LAYOUT.slotH },
        classes: 'server',
      })
    }
    for (const e of fabric.edges.filter((x) => x.tier === 'node-leaf' && groupOf.get(x.source) === g.id)) {
      out.push({
        group: 'edges',
        data: { id: e.id, source: e.source, target: e.target, kind: 'cable', network: 'compute', rail: e.rail, label: `rail ${e.rail}` },
        classes: `cable rail-${e.rail}`,
      })
    }
    for (const [pair, cables] of groupBy(uplinks, (e) => `${e.source}=>${e.target}`)) {
      const first = cables[0]!
      out.push({
        group: 'edges',
        data: { id: pair, source: first.source, target: first.target, kind: 'bundle', network: 'compute', rail: first.rail, count: cables.length, label: String(cables.length) },
        classes: `bundle uplink${first.rail === undefined ? '' : ` rail-${first.rail}`}`,
      })
    }
  })
  return out
}

function groupBy(edges: GraphEdge[], key: (e: GraphEdge) => string): Map<string, GraphEdge[]> {
  const m = new Map<string, GraphEdge[]>()
  for (const e of edges) {
    const k = key(e)
    const list = m.get(k)
    if (list) list.push(e)
    else m.set(k, [e])
  }
  return m
}
