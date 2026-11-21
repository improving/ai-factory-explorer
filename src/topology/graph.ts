import type { Fact } from '../catalog/fact'
import type { BlockRole } from '../catalog/factory'
import type { NodeKind } from '../catalog/kinds'
import type { RackRole } from '../catalog/racks'

export type Network =
  | 'compute'
  | 'converged'
  | 'oob'
  | 'nvlink'
  | 'pcie'
  | 'c2c'
  | 'north-south'
  | 'in-band'
  | 'storage'
  | 'power'
  | 'cooling'
  | 'management'
  | 'telemetry'
  | 'memory'
  | 'service'

export type GraphNode = {
  id: string
  kind: NodeKind
  label: string
  parent?: string // tray → server → SU
  su?: number
  rail?: number
  rack?: number
  index?: number
  numa?: number
  network?: Network // for ports
  rails?: number[] // a leaf: the rails that it serves
  plane?: number // a leaf or a cable: 0 = plane A, 1 = plane B
  word?: string // a group: 'servers', 'nodes', or 'trays'
  role?: BlockRole // a block of the factory overview
  u?: number // the rack layout: the lowest U of the device
  ru?: number // the height in U; 0 beside the U positions; a rack: the rack height
  face?: 'both' | 'front' | 'rear' // the side of the rack where the part shows
  rackRole?: RackRole
  device?: string // a port: the device that holds it
  name?: string // a port: the NIC name (mlx5)
  far?: boolean // the far end of a cable, in another rack
  used?: boolean // a port: a cable is on it
}

// One edge is one cable or one internal link. Views bundle the cables; the graph never does.
export type GraphEdge = {
  id: string
  kind: 'physical' | 'dependency'
  network: Network
  source: string
  target: string
  tier?: 'node-leaf' | 'leaf-spine'
  bandwidth?: Fact<number>
  rail?: number
  plane?: number
  note?: string
  label?: string // an overview link: what flows on it
}

export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] }

export const findNode = (g: Graph, id: string) => g.nodes.find((n) => n.id === id)
export const findEdge = (g: Graph, id: string) => g.edges.find((e) => e.id === id)

// The union of graphs, each node and edge once: the trace view inspects the parts of two servers.
export function mergeGraphs(...graphs: Graph[]): Graph {
  const nodes = new Map<string, GraphNode>()
  const edges = new Map<string, GraphEdge>()
  for (const g of graphs) {
    for (const n of g.nodes) nodes.set(n.id, n)
    for (const e of g.edges) edges.set(e.id, e)
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] }
}
