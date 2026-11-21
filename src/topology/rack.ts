import { designById } from '../catalog/designs'
import { derived, type Fact } from '../catalog/fact'
import { NVL72 } from '../catalog/nvl72'
import { platformFor } from '../catalog/platforms'
import { NVL72_UG_URL } from '../catalog/urls'
import type { Config } from '../config/config'
import type { Graph, GraphEdge, GraphNode } from './graph'
import { parseServerId, partId, rackId, serverId } from './ids'

const NVLINK = derived(0.1, 'TB/s (both directions)', '1.8 TB/s for each GPU, both directions, ÷ 18 links', NVL72_UG_URL)

// The NVL72 rack that holds one compute tray: its 18 compute trays (each with its GPUs, Grace CPUs,
// NICs, DPUs, and IMEX), its 9 NVLink switch trays (2 NVSwitch chips and NVOS each), and its 8 power
// shelves. Every GPU has one NVLink link to each of the 18 chips.
export function generateRack(config: Config, trayId: string): Graph {
  const parsed = parseServerId(trayId)
  if (!parsed) throw new Error(`No tray ${trayId}`)
  const p = platformFor(config)
  const perRack = designById(config.design).serversPerRack.value
  const rack = Math.ceil(parsed.n / perRack)
  const rid = rackId(parsed.su, rack)
  const nodes: GraphNode[] = [{ id: rid, kind: 'rack', label: `SU ${parsed.su} rack ${rack}`, su: parsed.su, index: rack }]
  const edges: GraphEdge[] = []
  const edge = (source: string, target: string, network: GraphEdge['network'], bandwidth?: Fact<number>) =>
    edges.push({ id: `${source}~${target}`, kind: 'physical', network, source, target, bandwidth })

  const chips: string[] = []
  for (let w = 1; w <= NVL72.switchTrays.value; w++) {
    const sw = `${rid}-sw${w}`
    nodes.push({ id: sw, kind: 'switch-tray', label: `Switch tray ${w}`, parent: rid, su: parsed.su, index: w })
    for (let c = 0; c < NVL72.chipsPerSwitchTray.value; c++) {
      const chip = partId(sw, `chip${c}`)
      nodes.push({ id: chip, kind: 'nvswitch', label: `NVSwitch ${w}.${c}`, parent: sw, su: parsed.su, index: c })
      chips.push(chip)
    }
    nodes.push({ id: partId(sw, 'nvos'), kind: 'service', label: 'NVOS: NVLSM, FM, NMX', parent: sw, su: parsed.su })
  }
  for (let s = 1; s <= NVL72.powerShelves.value; s++) {
    nodes.push({ id: `${rid}-ps${s}`, kind: 'power-shelf', label: `Power shelf ${s}`, parent: rid, su: parsed.su, index: s })
  }

  const numaOf = (gpu: number) => p.numaGpus.value.findIndex((group) => group.includes(gpu))
  for (let t = 1; t <= perRack; t++) {
    const tray = serverId(parsed.su, (rack - 1) * perRack + t)
    nodes.push({ id: tray, kind: 'tray', label: `Tray ${t}`, parent: rid, su: parsed.su, index: t })
    const part = (name: string) => partId(tray, name)
    for (let c = 0; c < p.cpus.value; c++) {
      nodes.push({ id: part(`cpu${c}`), kind: 'cpu', label: `Grace ${c}`, parent: tray, su: parsed.su, index: c, numa: c })
    }
    for (let i = 0; i < p.gpusPerServer.value; i++) {
      const gpu = part(`gpu${i}`)
      const nic = part(`nic${i}`)
      nodes.push({ id: gpu, kind: 'gpu', label: `GPU ${i}`, parent: tray, su: parsed.su, index: i, rail: i, numa: numaOf(i) })
      nodes.push({ id: nic, kind: 'nic', label: `NIC ${i}`, parent: tray, su: parsed.su, index: i, rail: i })
      edge(gpu, part(`cpu${numaOf(i)}`), 'c2c')
      edge(gpu, nic, 'pcie')
      for (const chip of chips) edge(gpu, chip, 'nvlink', NVLINK)
    }
    for (let d = 0; d < p.frontNic.count.value; d++) {
      const dpu = part(`dpu${d}`)
      nodes.push({ id: dpu, kind: 'dpu', label: `${p.frontNic.model.value} ${d}`, parent: tray, su: parsed.su, index: d, network: 'converged' })
      edge(dpu, part(`cpu${d % p.cpus.value}`), 'pcie')
    }
    nodes.push({ id: part('imex'), kind: 'service', label: 'IMEX', parent: tray, su: parsed.su })
  }
  return { nodes, edges }
}
