import type { DocRef } from './component-docs'
import { assumed, type Fact } from './fact'
import type { DocKind } from './kinds'
import type { Network } from '../topology/graph'
import type { LinkKind } from './paths'

export type RunbookId = 'RB-01' | 'RB-02' | 'RB-03' | 'RB-04' | 'RB-05' | 'RB-06' | 'RB-07' | 'RB-08' | 'RB-09' | 'RB-10' | 'RB-11' | 'RB-12'

// A written runbook of runbooks/: its title (line 17 or 18 of the file), section 3 "First 5 minutes" (the read-only
// steps of L1), and the catalogue rows that it covers (handbook/runbook-catalog.md, "Written runbooks").
export type Runbook = { id: RunbookId; title: string; rows: string[]; top: DocRef; first5: DocRef; coverage: string }

const runbook = (id: RunbookId, title: string, rows: string[], top: string, first5: string, coverage: string): Runbook => ({
  id,
  title,
  rows,
  top: { label: `${id}: ${title}`, source: top },
  first5: { label: 'First 5 minutes', source: first5 },
  coverage,
})

export const RUNBOOKS: Runbook[] = [
  runbook('RB-01', 'NVLink, NVSwitch, Fabric Manager, IMEX, NVLSM', ['G3', 'G7'], 'runbooks/RB-01-nvlink-fabric-fm-imex.md:18', 'runbooks/RB-01-nvlink-fabric-fm-imex.md:49', 'handbook/runbook-catalog.md:65'),
  runbook('RB-02', 'NCCL init hang, slow collective, wrong transport', ['N3', 'N4', 'N5'], 'runbooks/RB-02-nccl-init-hang-slow-transport.md:18', 'runbooks/RB-02-nccl-init-hang-slow-transport.md:67', 'handbook/runbook-catalog.md:66'),
  runbook('RB-03', 'GPU ECC, Xid, thermal, power, silent wrong results', ['G1', 'G2', 'G5', 'G6', 'G8'], 'runbooks/RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md:18', 'runbooks/RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md:50', 'handbook/runbook-catalog.md:67'),
  runbook('RB-04', 'InfiniBand or RoCE link, switch, UFM', ['N1', 'N2', 'N6', 'N7', 'N9'], 'runbooks/RB-04-ib-roce-link-switch-ufm.md:18', 'runbooks/RB-04-ib-roce-link-switch-ufm.md:51', 'handbook/runbook-catalog.md:68'),
  runbook('RB-05', 'Firmware, driver, BMC, BIOS, DKMS, DOCA-OFED', ['G4', 'G9', 'G10'], 'runbooks/RB-05-firmware-driver-bmc-bios-dkms-doca.md:18', 'runbooks/RB-05-firmware-driver-bmc-bios-dkms-doca.md:44', 'handbook/runbook-catalog.md:69'),
  runbook('RB-06', 'BlueField DPU boot, mlx5, eSwitch', [], 'runbooks/RB-06-bluefield-dpu-boot-mlx5-eswitch.md:18', 'runbooks/RB-06-bluefield-dpu-boot-mlx5-eswitch.md:44', 'handbook/runbook-catalog.md:70'),
  runbook('RB-07', 'Storage or checkpoint slow or stuck', ['S1', 'S2', 'S4', 'S5', 'V1', 'V2', 'V4'], 'runbooks/RB-07-storage-checkpoint-slow-stuck.md:18', 'runbooks/RB-07-storage-checkpoint-slow-stuck.md:39', 'handbook/runbook-catalog.md:71'),
  runbook('RB-08', 'Scheduling: Slurm, Kubernetes, BCM, power policy', ['P1', 'P2', 'P4', 'P7', 'R1', 'R2', 'N10'], 'runbooks/RB-08-platform-scheduling-slurm-k8s-bcm-power.md:18', 'runbooks/RB-08-platform-scheduling-slurm-k8s-bcm-power.md:47', 'handbook/runbook-catalog.md:72'),
  runbook('RB-09', 'CUDA toolchain errors, DCGM false positives', [], 'runbooks/RB-09-cuda-toolchain-dcgm-false-positive.md:18', 'runbooks/RB-09-cuda-toolchain-dcgm-false-positive.md:38', 'handbook/runbook-catalog.md:73'),
  runbook('RB-10', 'Facility emergencies: cooling and power', ['F1', 'F3'], 'runbooks/RB-10-facility-cooling-power-emergency.md:17', 'runbooks/RB-10-facility-cooling-power-emergency.md:40', 'handbook/runbook-catalog.md:74'),
  runbook('RB-11', 'Job pending: queue quota, gang, topology', ['P3'], 'runbooks/RB-11-job-pending-queue-gang-topology.md:18', 'runbooks/RB-11-job-pending-queue-gang-topology.md:44', 'handbook/runbook-catalog.md:75'),
  runbook('RB-12', 'Host not allocatable: lifecycle state', ['P9', 'P10'], 'runbooks/RB-12-host-not-allocatable-lifecycle.md:18', 'runbooks/RB-12-host-not-allocatable-lifecycle.md:44', 'handbook/runbook-catalog.md:76'),
]

const BY_ROW = new Map(RUNBOOKS.flatMap((r) => r.rows.map((row) => [row, r] as const)))
const BY_ID = new Map(RUNBOOKS.map((r) => [r.id, r] as const))

export const runbookOfRow = (row: string): Runbook | null => BY_ROW.get(row) ?? null

// The catalogue row of a reference to the runbook catalogue ("G1: GPU fell off the bus" → G1), or null.
export function rowOf(ref: DocRef): string | null {
  if (!ref.source.startsWith('handbook/runbook-catalog.md')) return null
  return /^([A-Z]+\d+):/.exec(ref.label)?.[1] ?? null
}

// The written runbooks of a list of references: each one once, in the order of the rows, then the extra ones.
export function writtenFor(refs: DocRef[], extra: RunbookId[] = []): Runbook[] {
  const out: Runbook[] = []
  const add = (r: Runbook | null | undefined) => {
    if (r && !out.includes(r)) out.push(r)
  }
  for (const ref of refs) {
    const row = rowOf(ref)
    if (row) add(runbookOfRow(row))
  }
  for (const id of extra) add(BY_ID.get(id))
  return out
}

// The written runbooks of a list of catalogue rows, in the order of the rows, each one once.
export function runbooksOfRows(rows: (string | undefined)[]): Runbook[] {
  const out: Runbook[] = []
  for (const row of rows) {
    const r = row ? runbookOfRow(row) : null
    if (r && !out.includes(r)) out.push(r)
  }
  return out
}

// The written runbooks of parts that no catalogue row names (the catalogue: "RB-06: none yet"; "RB-09: none").
export const PART_RUNBOOKS: Partial<Record<DocKind, { ids: RunbookId[]; why: Fact<string> }>> = {
  dpu: {
    ids: ['RB-06'],
    why: assumed('RB-06 for the BlueField DPU', undefined, 'No catalogue row yet; the catalogue gives RB-06 as a candidate new row (DPU data path).', 'handbook/runbook-catalog.md:70'),
  },
  gpu: {
    ids: ['RB-09'],
    why: assumed('RB-09 before an RMA', undefined, 'No catalogue row; RB-09 is the stop-and-confirm runbook for a DCGM warning or a CUDA error that has the signs of a GPU fault.', 'runbooks/RB-09-cuda-toolchain-dcgm-false-positive.md:20'),
  },
  service: {
    ids: ['RB-09'],
    why: assumed('RB-09 before you call a service fault a hardware fault', undefined, 'No catalogue row; RB-09 is the stop-and-confirm runbook for CUDA toolchain errors and DCGM health warnings that have the signs of a hardware or fabric fault.', 'runbooks/RB-09-cuda-toolchain-dcgm-false-positive.md:20'),
  },
}

// The written runbook of a hop. First the row that the checks of the hop name (a factory hop names its row:
// G9 for the BMC, V2 for the CNode, P7 for the VIP, G7 for Fabric Manager). Else, on the data plane, the row of
// the link and the network. Else none: a telemetry, access, or C2C hop has no row and no runbook.
export function hopRunbook(h: { link: LinkKind; network: Network; checks: DocRef[] }): Runbook | null {
  const named = writtenFor(h.checks)[0]
  if (named) return named
  if (h.link === 'nvlink') return runbookOfRow('G3') // NVLink error or NVSwitch fault
  if (h.link === 'pcie' && h.network === 'pcie') return runbookOfRow('N5') // GPUDirect RDMA, peermem, IOMMU, ACS
  if (h.link === 'infiniband' || h.link === 'ethernet') {
    if (h.network === 'compute') return runbookOfRow(h.link === 'infiniband' ? 'N2' : 'N6') // bit errors; RoCE congestion
    if (h.network === 'storage' || h.network === 'converged') return runbookOfRow('V1') // a slow storage client
  }
  return null
}
