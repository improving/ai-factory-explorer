import { confirmed, type Fact } from './fact'
import type { DocRef } from './component-docs'
import type { RunbookId } from './runbooks'

// The checklist of a runbook: the read-only steps of section 3 "First 5 minutes", then one mitigation row of
// section 6, with the gate and the undo that the runbook gives for it.
// `layer` is the layer of the stack that the command inspects, from the `[C:Lx]` tag of the runbook line (a tag
// that names a section, `[C:§10]`, or an environment variable, `[E]`, gives no layer). `who` is the rule of the
// runbook: L1 runs the steps of section 3 read-only; a mitigation row names its own level.
export type LayerId = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L8'
export type CheckStep = {
  n: number
  command: string
  expected: string
  layer: LayerId | null
  who: string
  gate: string
  undo: string
  source: DocRef
  says: string // the text of the cited line, so a moved line is visible
}

export const LAYER_LABEL: Record<LayerId, string> = {
  L1: 'L1: CPU, OS, and base hardware',
  L2: 'L2: GPU and node software',
  L3: 'L3: in-node GPU fabric',
  L4: 'L4: network fabric',
  L5: 'L5: storage',
  L6: 'L6: application and collectives',
  L7: 'L7: platform: Kubernetes, Slurm',
  L8: 'L8: observability',
}

const READ_ONLY = 'L1, read-only'

type StepInput = { n: number; file: string; line: number; layer: LayerId | null; command: string; expected: string; says: string }

const step = (s: StepInput): CheckStep => ({
  n: s.n,
  command: s.command,
  expected: s.expected,
  layer: s.layer,
  who: READ_ONLY,
  gate: 'none: the step is read-only',
  undo: 'none',
  source: { label: `${s.file.replace(/-.*$/, '')} step ${s.n}`, source: `runbooks/${s.file}:${s.line}` },
  says: s.says,
})

const action = (n: number, file: string, line: number, who: string, command: string, says: string, gate: string, undo: string): CheckStep => ({
  n,
  command,
  expected: 'the impact of the row, and the undo below',
  layer: null,
  who,
  gate,
  undo,
  source: { label: `${file.replace(/-.*$/, '')} mitigation`, source: `runbooks/${file}:${line}` },
  says,
})

export const CHECKLIST_NOTE: Fact<string> = confirmed(
  'the checklist transcribes section 3 and one mitigation row of the runbook; the Explorer does not run a command',
  undefined,
  'runbooks/RB-12-host-not-allocatable-lifecycle.md:44',
)

const RB01 = 'RB-01-nvlink-fabric-fm-imex.md'
const RB02 = 'RB-02-nccl-init-hang-slow-transport.md'
const RB03 = 'RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md'
const RB04 = 'RB-04-ib-roce-link-switch-ufm.md'
const RB11 = 'RB-11-job-pending-queue-gang-topology.md'
const RB12 = 'RB-12-host-not-allocatable-lifecycle.md'

export const CHECKLISTS: Partial<Record<RunbookId, CheckStep[]>> = {
  'RB-01': [
    step({ n: 1, file: RB01, line: 51, layer: 'L3', command: 'systemctl status nvidia-fabricmanager', expected: 'active (running)', says: '`systemctl status nvidia-fabricmanager` `[C:L3]`' }),
    step({ n: 2, file: RB01, line: 52, layer: 'L3', command: 'journalctl -u nvidia-fabricmanager', expected: 'a clean start, no Detected Pre-NVL5 system, no device query errors', says: 'no `Detected Pre-NVL5 system`' }),
    step({ n: 3, file: RB01, line: 53, layer: null, command: 'nvidia-imex-ctl -H -N', expected: 'every domain node READY, and the matrix C', says: 'all domain nodes `READY`, matrix `C`' }),
    action(4, RB01, 150, 'L2', 'NCCL_NVLS_ENABLE=0 <app>', 'NCCL workaround: disable NVLS', 'The job owner agrees. Evidence captured; `transport/nvls.cc` failure confirmed', 'Unset the variable'),
  ],
  'RB-02': [
    step({ n: 1, file: RB02, line: 69, layer: null, command: 'kubectl logs <pod>', expected: 'no NCCL WARN line; IB, not Using network Socket', says: 'Read the log that the job already wrote' }),
    step({ n: 2, file: RB02, line: 70, layer: null, command: 'dmesg -T | grep -i xid', expected: 'no Xid in the last hour', says: 'on every job node' }),
    step({ n: 3, file: RB02, line: 71, layer: 'L4', command: 'ibstat', expected: 'Active, LinkUp, the expected rate and link layer', says: '`ibstat` `[C:L4]` — expected: `Active`, `LinkUp`' }),
    action(4, RB02, 223, 'L2', 'NCCL_SOCKET_IFNAME=<if>', 'Pin the NCCL socket interface', 'The job owner agrees. `ip -br link | grep LOWER_UP`', 'Unset'),
  ],
  'RB-03': [
    step({ n: 1, file: RB03, line: 52, layer: 'L1', command: "dmesg -T | grep -iE 'xid|aer|nvme|pcie|dpc'", expected: 'no Xid or AER in the last hour; note the Xid number and the GPU or PCI address', says: 'no Xid/AER in the last hour' }),
    step({ n: 2, file: RB03, line: 53, layer: 'L2', command: 'nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE', expected: 'uncorrectable counters 0, no pending or failed row remap, no unexpected throttle', says: 'uncorrectable counters 0' }),
    step({ n: 3, file: RB03, line: 54, layer: 'L2', command: 'dcgmi health -c', expected: 'Healthy for every GPU', says: '`dcgmi health -c` `[C:L2]`' }),
    action(
      4,
      RB03,
      145,
      'L2',
      'nvidia-smi -pl <watts> -i <gpu>',
      'Cap GPU power for thermal mitigation',
      'The job owner agrees (the cap slows the job). `nvidia-smi -q` shows thermal/power throttle and `ipmitool sensor` confirms a cooling or power cause',
      'Remove the cap (set back to the default limit); record the change',
    ),
  ],
  'RB-04': [
    step({ n: 1, file: RB04, line: 53, layer: 'L4', command: 'ibstat', expected: 'Active, LinkUp, the expected rate and link layer', says: '`ibstat` `[C:L4]` — expected: `Active`, `LinkUp`' }),
    step({ n: 2, file: RB04, line: 54, layer: 'L4', command: 'iblinkinfo', expected: 'every link at the expected speed and width', says: 'every link at the expected speed/width' }),
    step({ n: 3, file: RB04, line: 55, layer: null, command: 'perfquery -x <lid>', expected: 'the symbol, link-recovery, and link-down counters flat', says: '`perfquery -x <lid>` `[C:§11.4]`' }),
    action(4, RB04, 170, 'L2', 'kubectl drain --ignore-daemonsets', 'Drain the affected node (RB-08 shared procedure)', 'ComputeDomain check on NVL72', 'Uncordon/RESUME after RB-08 return tests'),
  ],
  'RB-11': [
    step({ n: 1, file: RB11, line: 48, layer: 'L7', command: 'kubectl get pod <pod> -o wide', expected: 'the pod is Pending, and the last event names a reason', says: 'the pod is `Pending`, and the last event names a reason' }),
    step({ n: 2, file: RB11, line: 49, layer: 'L7', command: 'kubectl get podgroups -o wide', expected: 'minMember, and the largest free gang on one node or in one domain', says: 'Compare `minMember` with the largest free gang' }),
    step({ n: 3, file: RB11, line: 50, layer: 'L7', command: 'kubectl get queue <queue-name> -o yaml', expected: 'quota, limit, overQuotaWeight, priority, and the allocated value', says: 'Read `status` for the allocated value' }),
    action(4, RB11, 84, 'L2', 'kai.scheduler/batch-min-member', 'Reduce `kai.scheduler/batch-min-member`, or the parallelism', "Job owner decides; a smaller gang changes the job's shape", 'Re-submit with the original value'),
  ],
  'RB-12': [
    step({ n: 1, file: RB12, line: 46, layer: 'L7', command: 'nicocli machine get <machine-id> -o json > machine.json', expected: 'state, health, skuValidation, and the firmware inventory in one record', says: 'and the firmware inventory in one record' }),
    step({ n: 2, file: RB12, line: 47, layer: 'L7', command: "jq '{state, health}' machine.json", expected: 'the classification; PreventAllocations explains the failed instance request', says: '`PreventAllocations` explains the failed instance request' }),
    step({ n: 3, file: RB12, line: 48, layer: 'L7', command: "jq '.health.alerts[] | {id, target, classification}' machine.json", expected: 'the probe id and the target', says: 'the probe id and the target' }),
    action(
      4,
      RB12,
      82,
      'L4',
      'Flow operation run',
      'Update the firmware to the site baseline through a Flow operation run',
      'The host is unoccupied; the operation rule and the phase plan are approved; a rollback image exists',
      'Re-run the previous baseline',
    ),
  ],
}

export const checklistOf = (id: RunbookId): CheckStep[] | null => CHECKLISTS[id] ?? null

// The key of a step in the state and the URL: the runbook and the number, joined by a dot (no escaping in the URL).
export const stepKey = (id: RunbookId, n: number): string => `${id}.${n}`
