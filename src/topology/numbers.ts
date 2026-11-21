import { raRow, type FabricDesign, type RaRow } from '../catalog/designs'
import { assumed, derived, type Fact } from '../catalog/fact'
import { platformFor } from '../catalog/platforms'
import type { Config } from '../config/config'
import { TOR_NOTE, designOf, emptySlotsOf } from './fabric'
import type { Graph } from './graph'

export type RaCheck = { label: string; ra: number; app: number }

export type Numbers = {
  design: FabricDesign
  sus: number
  servers: number
  serverWord: string
  gpus: number
  leaves: number
  spines: number
  nodeLeafCables: number
  leafSpineCables: number
  bisection: Fact<number> | null
  ra: RaRow
  checks: RaCheck[] // only the counts that the RA row gives
  matchesRa: boolean | null // null: a rack with no fabric
  wiringAssumed: boolean // top-of-rack: the counts are the RA's, the wiring is not
  notes: string[]
  spares: number
  emptySlots: number
}

export function computeNumbers(fabric: Graph, config: Config): Numbers {
  const design = designOf(config)
  const perServer = platformFor(config).gpusPerServer.value
  const count = (kind: string) => fabric.nodes.filter((n) => n.kind === kind).length
  const servers = count('server')
  const leaves = count('leaf')
  const spines = count('spine')
  const nodeLeafCables = fabric.edges.filter((e) => e.tier === 'node-leaf').length
  const leafSpineCables = fabric.edges.filter((e) => e.tier === 'leaf-spine').length
  const gpus = servers * perServer
  const ra = raRow(design, config.suCount)!
  const emptySlots = emptySlotsOf(config)
  const planeCount = design.planes === 'dual' ? 2 : 1
  const emptyCables = leaves === 0 ? 0 : emptySlots * design.rails.value * planeCount
  const less = emptySlots > 0 ? ` (RA less ${emptySlots} empty slots)` : ''
  const speed = design.linkSpeed.value
  const bisection =
    leaves === 0
      ? null
      : (ra.leafSpineCables === undefined ? assumed : derived)(
          (nodeLeafCables * speed) / 2 / 1000,
          'Tb/s',
          ra.leafSpineCables === undefined
            ? `(${nodeLeafCables} node-leaf cables × ${speed} Gb/s) ÷ 2. The RA gives no leaf-spine count; the app assumes a non-blocking fat tree.`
            : `(${nodeLeafCables} node-leaf cables × ${speed} Gb/s) ÷ 2; each leaf has as many uplinks as downlinks, so the fat tree is non-blocking`,
          design.source,
        )
  const checks: RaCheck[] = [{ label: `${design.serverWord}${less}`, ra: ra.nodes - emptySlots, app: servers }]
  if (leaves > 0) {
    checks.push({ label: 'leaves', ra: ra.leaf, app: leaves }, { label: 'spines', ra: ra.spine, app: spines })
    if (ra.nodeLeafCables !== undefined) checks.push({ label: `node-leaf cables${less}`, ra: ra.nodeLeafCables - emptyCables, app: nodeLeafCables })
    if (ra.leafSpineCables !== undefined) checks.push({ label: 'leaf-spine cables', ra: ra.leafSpineCables, app: leafSpineCables })
  }
  const matchesRa = leaves === 0 ? null : checks.every((c) => c.ra === c.app)
  const notes: string[] = []
  const raGpus = ra.gpus === undefined ? undefined : ra.gpus - emptySlots * perServer // the empty slots have no GPUs
  if (raGpus !== undefined && raGpus !== gpus) {
    notes.push(`The RA table gives ${raGpus} GPUs${less}; ${servers} ${design.serverWord} × ${perServer} GPUs = ${gpus}.`)
  }
  if (emptySlots > 0) {
    notes.push(
      `The last SU has ${emptySlots} empty slots. NVIDIA builds all the switches and cables of an SU and leaves the unused part empty; the app does not draw the cables of the empty slots.`,
    )
  }
  if (config.topology === 'tor') notes.push(TOR_NOTE)
  return {
    design,
    sus: config.suCount,
    servers,
    serverWord: design.serverWord,
    gpus,
    leaves,
    spines,
    nodeLeafCables,
    leafSpineCables,
    bisection,
    ra,
    checks,
    matchesRa,
    wiringAssumed: config.topology === 'tor',
    notes,
    spares: config.spares,
    emptySlots,
  }
}
