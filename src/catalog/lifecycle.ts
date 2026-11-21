import { assignments, type NodeState } from '../topology/assign'
import type { Config } from '../config/config'

// True for a host: a server, or an NVL72 tray (both are server ids of the fabric). A lifecycle applies to a
// host, so the tab of a host has no content for another part.
export const isHost = (config: Config, id: string | null): boolean => id !== null && assignments(config).has(id)

// The nine states of a host in the NICo lifecycle (M10, "the bare-metal lifecycle").
// The site counts model four of them; the other five are in the table and have no count.
export type LifecycleId = 'discovered' | 'validated' | 'baseline' | 'available' | 'allocated' | 'in-use' | 'sanitizing' | 'quarantined' | 'in-repair'

export type LifecyclePhase = 'day 0' | 'day 1' | 'day 2' | 'branch'

export type LifecycleStep = {
  id: LifecycleId
  label: string
  phase: LifecyclePhase
  meaning: string
  entry: string
  exit: string
  gate: string
  evidence: string
  source: string
}

// Each step cites the M10 block that defines it. The mapping from the counts is in lifecycleOf.
export const LIFECYCLE: LifecycleStep[] = [
  {
    id: 'discovered',
    label: 'Discovered',
    phase: 'day 0',
    meaning: 'NICo found the BMC over the out-of-band network and paired the DPU to the host.',
    entry: 'The server is racked and cabled, and the operator declared the Expected Machine.',
    exit: 'A machine record exists, with the inventory and the DPU pairing.',
    gate: 'Redfish discovery, and the DPU pairing by LLDP and serial number.',
    evidence: 'The BMC inventory and the DPU-to-host link on the machine record.',
    source: 'runbooks/RB-12-host-not-allocatable-lifecycle.md:18',
  },
  {
    id: 'validated',
    label: 'Validated',
    phase: 'day 0',
    meaning: 'The machine matches its bill of materials.',
    entry: 'The machine record exists.',
    exit: 'No missing and no unexpected component.',
    gate: 'SKU validation.',
    evidence: 'The BOM result and the component list on the machine record.',
    source: 'runbooks/RB-12-host-not-allocatable-lifecycle.md:31',
  },
  {
    id: 'baseline',
    label: 'Firmware baseline',
    phase: 'day 0',
    meaning: 'The UEFI and BMC firmware match the site baseline.',
    entry: 'The SKU is valid.',
    exit: 'The firmware matches the baseline, and the host is not quarantined.',
    gate: 'The firmware baseline inventory and update.',
    evidence: 'The per-machine firmware inventory, against the site baseline.',
    source: 'runbooks/RB-12-host-not-allocatable-lifecycle.md:72',
  },
  {
    id: 'available',
    label: 'Available',
    phase: 'day 1',
    meaning: 'The host is in the pool and can receive a tenant.',
    entry: 'The Day 0 gates pass.',
    exit: 'An allocation assigns the host to a tenant.',
    gate: 'No health classification blocks the host.',
    evidence: 'The machine state, and the health classification list.',
    source: 'runbooks/RB-12-host-not-allocatable-lifecycle.md:18',
  },
  {
    id: 'allocated',
    label: 'Allocated',
    phase: 'day 1',
    meaning: 'The host is assigned to a tenant, and the instance is not running yet.',
    entry: 'An allocation gives the host to a tenant.',
    exit: 'The tenant creates the instance.',
    gate: 'The isolation on each plane, and the UEFI lockdown.',
    evidence: 'The allocation, the VPC, and the isolation state of each plane.',
    source: 'runbooks/RB-12-host-not-allocatable-lifecycle.md:18',
  },
  {
    id: 'in-use',
    label: 'In use',
    phase: 'day 1',
    meaning: 'The tenant instance runs on the host.',
    entry: 'The tenant created the instance, and the OS booted.',
    exit: 'The tenant releases the instance.',
    gate: 'The instance is healthy from the tenant view.',
    evidence: 'The instance record, and the tenant health view.',
    source: 'runbooks/RB-12-host-not-allocatable-lifecycle.md:29',
  },
  {
    id: 'sanitizing',
    label: 'Sanitizing',
    phase: 'day 2',
    meaning: 'The host is erased and cleaned before it returns to the pool.',
    entry: 'The tenant released the instance.',
    exit: 'The erase, the network cleanup, and the convergence gate pass.',
    gate: 'Secure erase, the UEFI memory-overwrite check, the IB reset, and the network cleanup.',
    evidence: 'The erase result, and the DPU confirmation that the host left every tenant network.',
    source: 'runbooks/RB-12-host-not-allocatable-lifecycle.md:85',
  },
  {
    id: 'quarantined',
    label: 'Quarantined',
    phase: 'branch',
    meaning: 'A gate failed, and the host is held out of the pool.',
    entry: 'A SKU, a firmware, a burn-in, or a health check fails.',
    exit: 'The gate passes, or the host goes to repair.',
    gate: 'The reason is on the machine record, and `PreventAllocations` is set.',
    evidence: 'The SKU result, the firmware inventory, or the health probe that failed.',
    source: 'runbooks/RB-12-host-not-allocatable-lifecycle.md:28',
  },
  {
    id: 'in-repair',
    label: 'In repair or maintenance',
    phase: 'branch',
    meaning: 'An operator or a repair tenant works on the host, or an operator holds it in maintenance.',
    entry: 'The host needs a repair, online or full, or an operator sets maintenance.',
    exit: 'The repair passes, or the operator clears maintenance; the host returns to validation or to the pool.',
    gate: 'Online repair keeps the instance; full repair releases it and cleans the machine. Maintenance sets three classifications.',
    evidence: 'The repair override, the repair outcome label, the maintenance flag, and the health report.',
    source: 'runbooks/RB-12-host-not-allocatable-lifecycle.md:90',
  },
]

export const LIFECYCLE_BY_ID = new Map(LIFECYCLE.map((s) => [s.id, s] as const))

// The four states that the counts model. A degraded host stays available: its health is in the Health overlay.
export const MODELLED: LifecycleId[] = ['available', 'in-use', 'quarantined', 'in-repair']

export const LIFECYCLE_MAP_NOTE =
  'The counts model four states: available, in use, quarantined, and in repair. A degraded host stays available, and the Health overlay shows its warning. The other five states are in the table and have no count.'

export function lifecycleOf(state: NodeState): LifecycleId {
  if (state === 'allocated') return 'in-use'
  if (state === 'maintenance') return 'in-repair'
  if (state === 'degraded') return 'available'
  return state
}

// The colour class of a lifecycle state on the canvas.
export const lifecycleClass = (id: LifecycleId): string => `ov-lc-${id}`
