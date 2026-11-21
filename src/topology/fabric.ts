import { designById, leafCount, raRow, type FabricDesign, type RaRow } from '../catalog/designs'
import type { Config } from '../config/config'
import { problems } from '../config/rules'
import type { Graph, GraphEdge, GraphNode } from './graph'
import { leafId, serverId, spineId, suId } from './ids'

export type FabricShape = {
  design: FabricDesign
  row: RaRow
  groups: number
  susPerGroup: number
  perSu: number
  perRack: number
  slotsPerGroup: number
  rails: number
  planeCount: number
  leavesPerGroup: number
  downPerLeaf: number
  uplinksPerLeaf: number
  perPair: number // cables between one leaf and one spine of its plane
  spinesPerPlane: number // each plane is an independent fabric with its own spines
}

export type LeafInfo = { index: number; plane: number; rails: number[]; tag: string | number; label: string }

export const designOf = (config: Config): FabricDesign => designById(config.design)

const PLANE = ['A', 'B']
const LEAF_SPINE_NOTE =
  'The RA gives the total of leaf-spine cables, or no count. The app assumes that each leaf connects to every spine with the same number of cables.'
export const TOR_NOTE =
  'Top-of-rack is an illustration (assumed), not an NVIDIA design: the same switches, but each leaf takes all the rails of a few servers.'

export function fabricShape(config: Config): FabricShape {
  const issues = problems(config)
  if (issues.length > 0) throw new Error(`Config is not valid: ${issues.join('; ')}`)
  const design = designOf(config)
  const row = raRow(design, config.suCount)!
  const perSu = design.serversPerSu.value
  const perRack = design.serversPerRack.value
  const rails = design.rails.value
  const planeCount = design.planes === 'dual' ? 2 : 1
  const susPerGroup = design.susPerGroup
  const groups = config.suCount / susPerGroup
  if (!Number.isInteger(groups)) throw new Error(`${config.suCount} SU do not divide into groups of ${susPerGroup}`)
  const slotsPerGroup = perSu * susPerGroup
  const expected = perSu * config.suCount - design.reservedSlots.filter((r) => r.su <= config.suCount).length
  if (row.nodes !== expected) throw new Error(`The RA gives ${row.nodes} ${design.serverWord}; the design gives ${expected}`)
  const leavesPerGroup = leafCount(design)
  const base = { design, row, groups, susPerGroup, perSu, perRack, slotsPerGroup, rails, planeCount, leavesPerGroup }
  if (leavesPerGroup === 0) return { ...base, downPerLeaf: 0, uplinksPerLeaf: 0, perPair: 0, spinesPerPlane: 0 }
  if (leavesPerGroup * groups !== row.leaf) throw new Error(`The RA gives ${row.leaf} leaves; the leaf rule needs ${leavesPerGroup} for each group`)
  const downPerLeaf = (slotsPerGroup * rails * planeCount) / leavesPerGroup
  const uplinksPerLeaf = row.leafSpineCables === undefined ? downPerLeaf : row.leafSpineCables / row.leaf
  const spinesPerPlane = row.spine / planeCount
  const perPair = uplinksPerLeaf / spinesPerPlane
  if (!Number.isInteger(downPerLeaf) || !Number.isInteger(spinesPerPlane) || !Number.isInteger(perPair)) throw new Error(`${uplinksPerLeaf} uplinks do not divide over ${spinesPerPlane} spines`)
  const ports = design.leafSwitch.ports.value
  if (downPerLeaf + uplinksPerLeaf > ports) throw new Error(`A leaf needs ${downPerLeaf + uplinksPerLeaf} ports; a ${design.leafSwitch.model.value} has ${ports}`)
  return { ...base, downPerLeaf, uplinksPerLeaf, perPair, spinesPerPlane }
}

// The leaves of the group whose first SU is groupSu, in index order, with the rails each one serves.
export function leavesOf(shape: FabricShape, topology: Config['topology'], groupSu: number): LeafInfo[] {
  const { design, rails, planeCount, leavesPerGroup, slotsPerGroup } = shape
  const su = shape.susPerGroup === 1 ? `SU${groupSu} ` : ''
  const perPlane = leavesPerGroup / planeCount
  const pTag = (p: number) => (planeCount === 2 ? `p${PLANE[p]}-` : '')
  const pLabel = (p: number) => (planeCount === 2 ? `plane ${PLANE[p]} ` : '')
  const all = Array.from({ length: rails }, (_, r) => r)
  return Array.from({ length: leavesPerGroup }, (_, index): LeafInfo => {
    const plane = Math.floor(index / perPlane)
    if (topology === 'tor') {
      const k = index % perPlane
      const per = slotsPerGroup / perPlane
      return { index, plane, rails: all, tag: `${pTag(plane)}tor${k + 1}`, label: `${su}${pLabel(plane)}ToR ${k + 1} (slots ${k * per + 1}-${(k + 1) * per})` }
    }
    const rule = design.leafRule
    switch (rule.kind) {
      case 'rail': {
        const rail = index % rails
        return { index, plane, rails: [rail], tag: planeCount === 2 ? `${pTag(plane)}r${rail}` : rail, label: `${su}${pLabel(plane)}rail ${rail}` }
      }
      case 'rail-pairs': {
        const r0 = index % rule.pairs
        const r1 = r0 + rule.pairs
        return { index, plane, rails: [r0, r1], tag: `${pTag(plane)}r${r0}+${r1}`, label: `${su}${pLabel(plane)}rails ${r0}+${r1}` }
      }
      case 'rail-split': {
        const rail = Math.floor(index / 2)
        const half = index % 2 === 0 ? 'a' : 'b'
        return { index, plane: 0, rails: [rail], tag: `r${rail}${half}`, label: `${su}rail ${rail}${half}` }
      }
      case 'none':
        throw new Error('A design with no fabric has no leaves')
    }
  })
}

// The leaf index (inside the group) of one rail and plane of the server in `slot` (1-based, inside the group).
export function leafIndexFor(shape: FabricShape, topology: Config['topology'], rail: number, plane: number, slot: number): number {
  const perPlane = shape.leavesPerGroup / shape.planeCount
  if (topology === 'tor') {
    const per = shape.slotsPerGroup / perPlane
    if (!Number.isInteger(per)) throw new Error(`${shape.slotsPerGroup} slots do not divide over ${perPlane} top-of-rack leaves`)
    return plane * perPlane + Math.floor((slot - 1) / per)
  }
  const rule = shape.design.leafRule
  switch (rule.kind) {
    case 'rail':
      return plane * shape.rails + rail
    case 'rail-pairs':
      return plane * rule.pairs + (rail % rule.pairs)
    case 'rail-split':
      return rail * 2 + (slot > rule.split ? 1 : 0)
    case 'none':
      throw new Error('A design with no fabric has no leaves')
  }
}

export function generateFabric(config: Config): Graph {
  const shape = fabricShape(config)
  const { design, row, groups, susPerGroup, perSu, perRack, rails, planeCount, perPair, spinesPerPlane } = shape
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  for (let j = 1; j <= row.spine; j++) {
    const plane = planeCount === 2 ? Math.floor((j - 1) / spinesPerPlane) : undefined
    const label = plane === undefined ? `Spine ${j}` : `Spine ${j} (plane ${PLANE[plane]})`
    nodes.push({ id: spineId(j), kind: 'spine', label, index: j, plane })
  }

  for (let g = 1; g <= groups; g++) {
    const first = (g - 1) * susPerGroup + 1
    const last = first + susPerGroup - 1
    const label = susPerGroup === 1 ? `SU ${first}` : `SU ${first}-${last}`
    nodes.push({ id: suId(first), kind: 'su', label, su: first, index: g, word: design.serverWord })
    const leaves = shape.leavesPerGroup > 0 ? leavesOf(shape, config.topology, first) : []
    for (const l of leaves) {
      nodes.push({ id: leafId(first, l.tag), kind: 'leaf', label: l.label, su: first, rail: l.rails[0], rails: l.rails, plane: l.plane, index: l.index })
    }
    for (let su = first; su <= last; su++) {
      for (let n = 1; n <= perSu; n++) {
        if (design.reservedSlots.some((r) => r.su === su && r.slot === n)) continue
        if (su === config.suCount && n > perSu - config.lastSuEmpty) continue // an empty slot of the last SU
        const id = serverId(su, n)
        const slot = (su - first) * perSu + n
        nodes.push({ id, kind: 'server', label: id, parent: suId(first), su, rack: Math.ceil(slot / perRack), index: slot })
        if (leaves.length === 0) continue
        for (let r = 0; r < rails; r++) {
          for (let p = 0; p < planeCount; p++) {
            const leaf = leaves[leafIndexFor(shape, config.topology, r, p, slot)]!
            edges.push({
              id: planeCount === 2 ? `${id}~r${r}${PLANE[p]}` : `${id}~r${r}`,
              kind: 'physical',
              network: 'compute',
              tier: 'node-leaf',
              source: id,
              target: leafId(first, leaf.tag),
              rail: r,
              plane: p,
              bandwidth: design.linkSpeed,
            })
          }
        }
      }
    }
    for (const l of leaves) {
      // A dual-plane leaf connects only to the spines of its own plane.
      const firstSpine = l.plane * spinesPerPlane + 1
      for (let j = firstSpine; j < firstSpine + spinesPerPlane; j++) {
        for (let c = 1; c <= perPair; c++) {
          edges.push({
            id: `${leafId(first, l.tag)}~${spineId(j)}~${c}`,
            kind: 'physical',
            network: 'compute',
            tier: 'leaf-spine',
            source: leafId(first, l.tag),
            target: spineId(j),
            rail: config.topology === 'tor' ? undefined : l.rails[0],
            plane: l.plane,
            bandwidth: design.leafSwitch.portSpeed,
            note: LEAF_SPINE_NOTE,
          })
        }
      }
    }
  }
  return { nodes, edges }
}

// The slots of the last SU that the empty racks leave out. A reserved slot (the B200 UFM slot) is
// already out of the RA row, so it is not counted again.
export function emptySlotsOf(config: Config): number {
  const d = designOf(config)
  const fill = d.serversPerSu.value - config.lastSuEmpty
  let n = 0
  for (let slot = fill + 1; slot <= d.serversPerSu.value; slot++) {
    if (!d.reservedSlots.some((r) => r.su === config.suCount && r.slot === slot)) n++
  }
  return n
}
