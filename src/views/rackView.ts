import type cytoscape from 'cytoscape'
import type { Graph, GraphNode } from '../topology/graph'

type El = cytoscape.ElementDefinition
const ROW_H = 90

// The rows from top to bottom: 4 power shelves, compute trays 1-10, the 9 switch trays, compute trays
// 11-18, 4 power shelves. The pages read do not give this order (NVL72.layout is assumed).
export function rackElements(rack: Graph): El[] {
  const byKind = (kind: string) => rack.nodes.filter((n) => n.kind === kind).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  const shelves = byKind('power-shelf')
  const trays = byKind('tray')
  const switches = byKind('switch-tray')
  const rows = [...shelves.slice(0, 4), ...trays.slice(0, 10), ...switches, ...trays.slice(10), ...shelves.slice(4)]
  const rowOf = new Map(rows.map((n, i) => [n.id, i]))
  const out: El[] = []
  for (const n of rack.nodes) {
    const data = { id: n.id, ...(n.parent ? { parent: n.parent } : {}), label: n.label, kind: n.kind, rail: n.rail, network: n.network }
    if (n.kind === 'rack' || n.kind === 'tray' || n.kind === 'switch-tray') {
      out.push({ group: 'nodes', data, classes: n.kind })
      continue
    }
    const row = rowOf.get(n.kind === 'power-shelf' ? n.id : n.parent!)
    if (row === undefined) throw new Error(`No row for ${n.id}`)
    out.push({
      group: 'nodes',
      data,
      position: { x: xOf(n), y: row * ROW_H },
      classes: `part ${n.kind}${n.rail === undefined ? '' : ` rail-${n.rail}`}`,
    })
  }
  for (const e of rack.edges) {
    out.push({
      group: 'edges',
      data: { id: e.id, source: e.source, target: e.target, kind: 'cable', network: e.network, rail: e.rail },
      classes: e.network === 'nvlink' ? 'nvlink fabric' : e.network,
    })
  }
  return out
}

function xOf(n: GraphNode): number {
  const i = n.index ?? 0
  switch (n.kind) {
    case 'power-shelf':
      return 700
    case 'gpu':
      return 100 + i * 100
    case 'cpu':
      return 560 + i * 110
    case 'nic':
      return 820 + i * 90
    case 'dpu':
      return 1220 + i * 90
    case 'nvswitch':
      return 300 + i * 400
    case 'service':
      return n.parent?.includes('-sw') ? 1100 : 1420
    default:
      return 0
  }
}
