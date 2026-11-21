import type cytoscape from 'cytoscape'
import type { Graph, GraphNode } from '../topology/graph'

type El = cytoscape.ElementDefinition

// Fixed positions: NVSwitch chips on top, GPUs, then the NIC under each GPU, then CPUs with their DIMMs,
// then the ports on the edge of the server, then the node services. Front NICs and DPUs on the left;
// PSUs, fans, and the BMC on the right.
function position(n: GraphNode, chips: number): { x: number; y: number } {
  const i = n.index ?? 0
  switch (n.kind) {
    case 'nvswitch':
      return { x: ((i + 0.5) * 840) / chips, y: 0 }
    case 'gpu':
      return { x: i * 120, y: 140 }
    case 'nic':
      return n.network === 'converged' ? { x: -240, y: 280 + i * 140 } : { x: i * 120, y: 280 }
    case 'cpu':
      return { x: 180 + i * 480, y: 420 }
    case 'dpu':
      return { x: -240, y: 280 + i * 140 }
    case 'dimm':
      return { x: 310 + i * 480, y: 420 }
    case 'nvme':
      return { x: 360 + i * 120, y: 520 }
    case 'psu':
      return { x: 1020, y: 0 }
    case 'fan':
      return { x: 1020, y: 140 }
    case 'bmc':
      return { x: 1020, y: 420 }
    case 'service':
      return { x: -240 + i * 170, y: 780 }
    case 'port':
      if (n.network === 'compute') return { x: i * 120, y: 640 }
      if (n.network === 'converged') return { x: -330 + i * 60, y: 640 }
      return { x: 1020, y: 640 }
    default:
      return { x: 0, y: 760 }
  }
}

export function nodeElements(server: Graph): El[] {
  const chips = Math.max(1, server.nodes.filter((n) => n.kind === 'nvswitch').length)
  const out: El[] = []
  for (const n of server.nodes) {
    out.push({
      group: 'nodes',
      data: { id: n.id, label: n.label, kind: n.kind, rail: n.rail, network: n.network },
      position: position(n, chips),
      classes: `part ${n.kind}${n.rail === undefined ? '' : ` rail-${n.rail}`}`,
    })
  }
  for (const e of server.edges) {
    out.push({
      group: 'edges',
      data: { id: e.id, source: e.source, target: e.target, kind: 'cable', network: e.network, rail: e.rail },
      classes: `${e.network}${e.rail === undefined ? '' : ` rail-${e.rail}`}`,
    })
  }
  return out
}
