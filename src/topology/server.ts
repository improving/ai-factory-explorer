import { assumed, type Fact } from '../catalog/fact'
import type { NodeKind } from '../catalog/kinds'
import { platformFor, type Platform } from '../catalog/platforms'
import { NODE_SERVICES, servicesFor } from '../catalog/services'
import type { Config } from '../config/config'
import type { Graph, GraphEdge, GraphNode, Network } from './graph'
import { parseServerId, partId, serverExists } from './ids'
import { generateRack } from './rack'

const GPU_NIC_NOTE = 'Each GPU has its own compute NIC. The PCIe path between them is not in the sources; the picture shows a direct link.'
const FRONT_CPU_NOTE = 'Assumed: the front NICs are spread over the CPUs, for the picture only.'

// The inside of one server, or the whole NVL72 rack of one compute tray.
export function generateServer(config: Config, id: string): Graph {
  if (!parseServerId(id) || !serverExists(config, id)) throw new Error(`No server ${id} in this configuration`)
  const p = platformFor(config)
  return p.form === 'nvl72-tray' ? generateRack(config, id) : generateHgx(p, id)
}

function generateHgx(p: Platform, id: string): Graph {
  const parsed = parseServerId(id)!
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const add = (part: string, kind: NodeKind, label: string, extra: Partial<GraphNode> = {}) =>
    nodes.push({ id: partId(id, part), kind, label, parent: id, su: parsed.su, ...extra })
  const link = (a: string, b: string, network: Network, extra: Partial<GraphEdge> = {}) =>
    edges.push({ id: `${partId(id, a)}~${b}`, kind: 'physical', network, source: partId(id, a), target: partId(id, b), ...extra })
  const numaOf = (gpu: number) => p.numaGpus.value.findIndex((group) => group.includes(gpu))
  const chips = p.nvswitches.value
  const share = assumed(
    p.nvlinkPerGpu.value / chips,
    'TB/s',
    `${p.nvlinkPerGpu.value} TB/s for each GPU ÷ ${chips} NVSwitch chips. No source gives the split; the app assumes an even split.`,
    p.nvlinkPerGpu.source,
  )

  for (let j = 0; j < chips; j++) add(`nvswitch${j}`, 'nvswitch', `NVSwitch ${j}`, { index: j })
  for (let c = 0; c < p.cpus.value; c++) add(`cpu${c}`, 'cpu', `CPU ${c} (NUMA ${c})`, { index: c, numa: c })

  for (let i = 0; i < p.gpusPerServer.value; i++) {
    const numa = numaOf(i)
    add(`gpu${i}`, 'gpu', `GPU ${i}`, { index: i, numa, rail: i })
    const mlx5 = p.computeMlx5?.value[i]
    add(`nic${i}`, 'nic', mlx5 ? `NIC ${i} (${mlx5})` : `NIC ${i}`, { index: i, numa, rail: i })
    add(`port-c${i}`, 'port', `${p.computePorts.value[i]} (rail ${i})`, { index: i, rail: i, network: 'compute' })
    for (let j = 0; j < chips; j++) link(`gpu${i}`, `nvswitch${j}`, 'nvlink', { bandwidth: share })
    link(`gpu${i}`, `nic${i}`, 'pcie', { note: GPU_NIC_NOTE })
    link(`nic${i}`, `cpu${numa}`, 'pcie')
    link(`nic${i}`, `port-c${i}`, 'compute', { rail: i, bandwidth: p.computeNic.speed })
  }

  const front = p.frontNic
  const isDpu = (front.model.value ?? '').includes('BlueField')
  const speed = front.speed.value === null ? undefined : (front.speed as Fact<number>)
  for (let d = 0; d < front.count.value; d++) {
    const part = isDpu ? `dpu${d}` : `fnic${d}`
    add(part, isDpu ? 'dpu' : 'nic', `${front.model.value} ${d}`, { index: d, network: 'converged' })
    link(part, `cpu${d % p.cpus.value}`, 'pcie', { note: FRONT_CPU_NOTE })
    for (let q = 0; q < front.portsEach.value; q++) {
      add(`port-n${d}${q}`, 'port', `Converged port ${d}.${q}`, { index: d * front.portsEach.value + q, network: 'converged' })
      link(part, `port-n${d}${q}`, 'converged', { bandwidth: speed })
    }
  }

  // The parts with no fabric link: one box for each group. The sources give no attachment for the
  // PSUs and the fans, so they have no link; the drives link to a CPU for the picture only.
  const NVME_NOTE = 'Assumed attachment, for the picture only.'
  add('nvme-boot', 'nvme', `Boot: ${p.nvmeBoot.value ?? 'NVMe (not sourced)'}`, { index: 0 })
  add('nvme-data', 'nvme', `Data: ${p.nvmeData.value ?? 'NVMe (not sourced)'}`, { index: 1 })
  link('nvme-boot', 'cpu0', 'pcie', { note: NVME_NOTE })
  link('nvme-data', `cpu${p.cpus.value - 1}`, 'pcie', { note: NVME_NOTE })
  for (let c = 0; c < p.cpus.value; c++) {
    const label = p.dimms.value === null ? 'DIMMs (not sourced)' : `DIMMs × ${p.dimms.value / p.cpus.value}`
    add(`dimm${c}`, 'dimm', label, { index: c, numa: c })
    link(`dimm${c}`, `cpu${c}`, 'memory')
  }
  add('psu', 'psu', p.psus.value === null ? 'PSUs (not sourced)' : `PSUs: ${p.psus.value}`)
  add('fan', 'fan', p.fans.value === null ? 'Fans (count not sourced)' : `Fans: ${p.fans.value}`)

  // The node services: a band of boxes, each linked to the parts that it manages.
  servicesFor(p).forEach((sid, k) => {
    const svc = NODE_SERVICES[sid]
    add(`svc-${sid}`, 'service', svc.label, { index: k })
    const targets =
      svc.manages === 'gpus'
        ? Array.from({ length: p.gpusPerServer.value }, (_, i) => `gpu${i}`)
        : svc.manages === 'nvswitches'
          ? Array.from({ length: chips }, (_, j) => `nvswitch${j}`)
          : ['svc-driver']
    for (const t of targets) link(`svc-${sid}`, t, 'service')
  })
  add('bmc', 'bmc', 'BMC')
  add('port-oob', 'port', 'OOB port (BMC)', { network: 'oob' })
  link('bmc', 'port-oob', 'oob')
  return { nodes, edges }
}
