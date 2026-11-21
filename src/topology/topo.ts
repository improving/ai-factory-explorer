import type { FactStatus } from '../catalog/fact'
import { platformFor } from '../catalog/platforms'
import type { Config } from '../config/config'
import { partId } from './ids'

export type TopoCell = { text: string; status: FactStatus; a: string; b: string }
export type TopoRow = { head: string; id: string; cells: TopoCell[] }
export type TopoMatrix = { heads: string[]; rows: TopoRow[]; nicNames: string[] }

// The nvidia-smi topo -m matrix of one HGX server, from the platform facts: NVLink between the GPUs,
// PIX between GPU i and NIC i (assumed), and NODE or SYS from the NUMA map. An NVL72 tray has no matrix.
export function topoMatrix(config: Config, serverId: string): TopoMatrix | null {
  const p = platformFor(config)
  if (p.form !== 'hgx8') return null
  const n = p.gpusPerServer.value
  const numa = (i: number) => p.numaGpus.value.findIndex((g) => g.includes(i))
  const links = p.nvlinkLinksPerGpu
  const parts = [
    ...Array.from({ length: n }, (_, i) => ({ head: `GPU${i}`, id: partId(serverId, `gpu${i}`), gpu: true, i })),
    ...Array.from({ length: n }, (_, i) => ({ head: `NIC${i}`, id: partId(serverId, `nic${i}`), gpu: false, i })),
  ]
  const cell = (a: (typeof parts)[number], b: (typeof parts)[number]): TopoCell => {
    const ends = { a: a.id, b: b.id }
    if (a.id === b.id) return { text: 'X', status: 'confirmed', ...ends }
    if (a.gpu && b.gpu) return { text: links.value === null ? 'NV?' : `NV${links.value}`, status: links.status, ...ends }
    if (a.gpu !== b.gpu && a.i === b.i) return { text: 'PIX', status: 'assumed', ...ends }
    return { text: numa(a.i) === numa(b.i) ? 'NODE' : 'SYS', status: p.numaGpus.status, ...ends }
  }
  return {
    heads: parts.map((x) => x.head),
    rows: parts.map((a) => ({ head: a.head, id: a.id, cells: parts.map((b) => cell(a, b)) })),
    nicNames: p.computeMlx5 ? p.computeMlx5.value.map((name, i) => `NIC${i}: ${name}`) : [],
  }
}
