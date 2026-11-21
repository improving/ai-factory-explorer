import type { DocRef } from '../catalog/component-docs'
import { assumed, type Fact } from '../catalog/fact'
import { DRAIN_LABEL, FAIL_RULES, type FailKind } from '../catalog/failures'
import { rowOf } from '../catalog/runbooks'
import type { Config } from '../config/config'
import { failKind, validFailure, type Failure } from '../simulate/failable'
import { serverOf } from '../topology/ids'

// The diagnosis model of M7, machine-assisted diagnosis: the events of one incident in time order, and the
// fields of the verdict (terminal_state, sub_domain, the failure class, the responsible node).
export type SubDomain = 'hardware' | 'system_software'
export type DiagClass = 'gpu' | 'fabric' | 'sensor' | 'software' | 'platform' | 'application'
export type EventSource = 'kernel' | 'dmesg' | 'nccl' | 'scheduler' | 'kubelet' | 'prometheus' | 'bmc' | 'nicocli' | 'log'
export type TerminalState = 'NODE_FAIL' | 'FAILED' | 'TIMEOUT' | 'PENDING'

// The class of a signal, the sub_domain that it votes for, and the short name for a table cell.
export const CLASS_INFO: Record<DiagClass, { label: string; short: string; sub: SubDomain }> = {
  gpu: { label: 'GPU: Xid, ECC, thermal', short: 'GPU', sub: 'hardware' },
  fabric: { label: 'Fabric: link, switch, subnet manager', short: 'Fabric', sub: 'hardware' },
  sensor: { label: 'Sensor or component: BMC reading, PSU, fan, leak', short: 'Sensor', sub: 'hardware' },
  software: { label: 'Service software: driver, Fabric Manager, UFM, DNS', short: 'Service software', sub: 'system_software' },
  platform: { label: 'Platform: scheduler, quota, gang, lifecycle state, firmware', short: 'Platform', sub: 'system_software' },
  application: { label: 'Application: exit code, memory limit', short: 'Application', sub: 'system_software' },
}

// The M7 block gives the four sub_domain values and the fields of the diagnosis. It does not give the class
// of each signal, so this mapping is the model of the app.
export const DIAG_CLASS_NOTE: Fact<string> = assumed(
  'the class of each signal, and the sub_domain that it votes for',
  undefined,
  'The diagnosis block gives `sub_domain` as hardware, system_software, ambiguous, or unattributed, and the fields of the diagnosis. It does not give the class of each signal, so the app sets the six classes.',
  'handbook/concepts.md:217',
)

export type DiagEvent = {
  t: number // seconds after the first event of the incident
  src: EventSource
  text: string // the line, as the tool prints it
  subject?: string // the element on the canvas (a server, a GPU, a link, a service)
  node?: string // the node that the event names
  cls?: DiagClass // the class that this event votes for; absent for a symptom or the context
  state?: TerminalState // the state of the workload after this event
  row?: string // the catalogue row of runbook-catalog.md (G1, N2, P3, P9)
  ref?: DocRef // the repository line of the signal or the rule
  note?: string // one sentence: how to read the event
}

export type Incident = {
  id: string
  label: string
  start: string // the clock of the first event, HH:MM:SS
  story: string[] // the narrative of the incident, in the panel
  events: DiagEvent[]
  learn: DocRef
}

// The clock of an event: the start of the incident plus its offset.
export function clockOf(start: string, t: number): string {
  const [h, m, s] = start.split(':').map(Number) as [number, number, number]
  const total = h * 3600 + m * 60 + s + Math.max(0, Math.round(t))
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(Math.floor(total / 3600) % 24)}:${two(Math.floor(total / 60) % 60)}:${two(total % 60)}`
}

const rb = (file: string, line: number, label: string): DocRef => ({ label, source: `runbooks/${file}:${line}` })
const cr = (line: number, label: string): DocRef => ({ label, source: `handbook/command-reference.md:${line}` })

const RB03 = 'RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md'
const RB04 = 'RB-04-ib-roce-link-switch-ufm.md'
const RB02 = 'RB-02-nccl-init-hang-slow-transport.md'
const RB11 = 'RB-11-job-pending-queue-gang-topology.md'
const RB12 = 'RB-12-host-not-allocatable-lifecycle.md'

const DIAG = (): DocRef => ({ label: 'Machine-assisted diagnosis', source: 'handbook/concepts.md:217' })

// The saved incidents. Each event cites the repository line of the signal or the rule; the lines are examples
// of a class, as the scenarios of the simulator are.
export const INCIDENTS: Incident[] = [
  {
    id: 'reboot-xid145',
    label: 'A reboot, then Xid 145, then NODE_FAIL',
    start: '03:58:00',
    story: [
      'The published example of the Attribution README: a reboot at 04:00, then Xid 145, then a Slurm NODE_FAIL.',
      'The verdict is a hardware class, but the chain shows the reboot before the Xid.',
      'The operator checks the reboot before the RMA.',
    ],
    learn: DIAG(),
    events: [
      {
        t: 0,
        src: 'kernel',
        text: 'Linux version 6.8.0-1012-nvidia (the node restarted)',
        subject: 'su1-n14',
        node: 'su1-n14',
        ref: DIAG(),
        note: 'The reboot is upstream of the Xid: it is context, not a vote.',
      },
      {
        t: 560,
        src: 'dmesg',
        text: 'NVRM: Xid 145, GPU 0000:9A:00.0: a fatal error in the GPU',
        subject: 'su1-n14/gpu3',
        node: 'su1-n14',
        cls: 'gpu',
        row: 'G1',
        ref: DIAG(),
      },
      {
        t: 570,
        src: 'log',
        text: 'nvidia-smi: Unable to determine the device handle for GPU 0000:9A:00.0: Unknown Error',
        subject: 'su1-n14/gpu3',
        node: 'su1-n14',
        cls: 'gpu',
        row: 'G1',
        ref: rb(RB03, 53, 'RB-03 step 2: the ECC and throttle check'),
      },
      {
        t: 575,
        src: 'scheduler',
        text: 'scontrol: Node=su1-n14 State=NODE_FAIL Reason="Xid 145"',
        subject: 'su1-n14',
        node: 'su1-n14',
        state: 'NODE_FAIL',
        ref: DIAG(),
      },
      {
        t: 640,
        src: 'scheduler',
        text: 'job 8841 (32 GPUs on 4 nodes) requeued at attempt 2',
        ref: DIAG(),
      },
    ],
  },
  {
    id: 'xid79-multinode',
    label: 'Xid 79 during a multi-node job',
    start: '10:12:00',
    story: [
      'A rank stops, and the job fails.',
      'The NCCL error is the symptom; the Xid 79 in dmesg is the cause.',
      'A Xid 79 makes you drain the node immediately (see RB-03).',
    ],
    learn: rb(RB03, 52, 'RB-03 step 1: the Xid check'),
    events: [
      {
        t: 0,
        src: 'nccl',
        text: 'rank 12: NCCL WARN NET/IB : Got completion from peer with error 12, retrying',
        ref: rb(RB02, 69, 'RB-02 step 1: the per-rank log'),
        note: 'A NCCL error is a symptom: it does not vote.',
      },
      {
        t: 45,
        src: 'dmesg',
        text: 'NVRM: Xid 79, GPU 0000:9A:00.0: GPU has fallen off the bus',
        subject: 'su1-n14/gpu3',
        node: 'su1-n14',
        cls: 'gpu',
        row: 'G1',
        ref: rb(RB03, 52, 'RB-03 step 1: the Xid check'),
      },
      {
        t: 50,
        src: 'log',
        text: 'nvidia-smi: Unable to determine the device handle for GPU 0000:9A:00.0',
        subject: 'su1-n14/gpu3',
        node: 'su1-n14',
        cls: 'gpu',
        row: 'G1',
        ref: rb(RB03, 53, 'RB-03 step 2: the ECC and throttle check'),
      },
      {
        t: 95,
        src: 'scheduler',
        text: 'scontrol: Node=su1-n14 State=NODE_FAIL Reason="Xid 79"',
        subject: 'su1-n14',
        node: 'su1-n14',
        state: 'NODE_FAIL',
        row: 'G1',
        ref: { label: 'The OEM case with the evidence', source: 'handbook/runbook-catalog.md:82' },
      },
    ],
  },
  {
    id: 'ufm-failover-nccl',
    label: 'NCCL timeout after a UFM failover',
    start: '01:59:00',
    story: [
      'The active UFM unit fails over to the standby during planned maintenance.',
      'The fabric is healthy after the failover, but some running jobs stop with a timeout.',
      'The link counters are flat, so the cause is the subnet manager, not the fabric.',
    ],
    learn: cr(169, 'command-reference: ufm_ha_cluster status'),
    events: [
      {
        t: 0,
        src: 'log',
        text: 'ufm_ha_cluster status: the master role moved from ufm-01 to ufm-02',
        cls: 'software',
        ref: cr(169, 'command-reference: ufm_ha_cluster status'),
        note: 'The subnet manager is software: it votes for system_software.',
      },
      {
        t: 120,
        src: 'nccl',
        text: 'rank 3: NCCL WARN Call to ibv_reg_mr failed, retrying (job 9012)',
        ref: rb(RB02, 69, 'RB-02 step 1: the per-rank log'),
      },
      {
        t: 150,
        src: 'log',
        text: 'ibstat: Port 1: State Active, Physical state LinkUp, Rate 400 Gb/s',
        ref: rb(RB04, 53, 'RB-04 step 1: ibstat'),
        note: 'The ports are up: this event rules out a link fault.',
      },
      {
        t: 200,
        src: 'scheduler',
        text: 'job 9012: TIMEOUT after 1800 s with no progress',
        state: 'TIMEOUT',
        row: 'N7',
        ref: rb(RB04, 55, 'RB-04 step 3: perfquery'),
      },
    ],
  },
  {
    id: 'host-not-allocatable',
    label: 'The host is ready, but no instance can use it',
    start: '09:00:00',
    story: [
      'The machine is ready and its SKU is valid, but instance creation fails.',
      'Two gates fit: a sensor classification, and a firmware that differs from the baseline.',
      'The evidence does not choose between them, so the verdict is ambiguous (RB-12).',
    ],
    learn: rb(RB12, 47, 'RB-12 step 2: the health classification'),
    events: [
      {
        t: 0,
        src: 'nicocli',
        text: 'health.alerts[0]: {id: "sensor-inlet-temp", target: "BMC", classification: "SensorCritical"}',
        subject: 'su1-n31',
        node: 'su1-n31',
        cls: 'sensor',
        row: 'P9',
        ref: rb(RB12, 48, 'RB-12 step 3: the alerts'),
      },
      {
        t: 30,
        src: 'nicocli',
        text: 'firmware: BMC 01.45.12; the site baseline is 01.48.03',
        subject: 'su1-n31',
        node: 'su1-n31',
        cls: 'platform',
        row: 'P10',
        ref: rb(RB12, 72, 'RB-12 decision 6: the firmware differs from the baseline'),
      },
      {
        t: 60,
        src: 'nicocli',
        text: 'skuValidation: pass; every component matches the bill of materials',
        subject: 'su1-n31',
        node: 'su1-n31',
        ref: rb(RB12, 46, 'RB-12 step 1: the machine record'),
        note: 'The SKU is not the cause.',
      },
      {
        t: 90,
        src: 'kubelet',
        text: 'instance creation failed: the machine is not allocatable',
        state: 'FAILED',
        row: 'P9',
        ref: rb(RB12, 81, 'RB-12 A1: clear the override or set maintenance'),
      },
    ],
  },
  {
    id: 'job-pending',
    label: 'The job waits, and no node holds the gang',
    start: '14:20:00',
    story: [
      'The pod is pending, and the last event names the reason.',
      'The gang needs 32 GPUs, and the queue is at its quota.',
      'RB-11 gives the order of the checks: the queue, the gang, then the topology.',
    ],
    learn: rb(RB11, 49, 'RB-11 step 2: the pod group'),
    events: [
      {
        t: 0,
        src: 'scheduler',
        text: 'pod train-7f9c-0 Pending: 0/72 nodes are available: 32 Insufficient nvidia.com/gpu',
        ref: rb(RB11, 48, 'RB-11 step 1: the pod events'),
      },
      {
        t: 20,
        src: 'scheduler',
        text: 'podgroup train-7f9c: minMember 32; the largest free gang in one domain is 16',
        cls: 'platform',
        row: 'P3',
        ref: rb(RB11, 49, 'RB-11 step 2: the pod group'),
      },
      {
        t: 40,
        src: 'scheduler',
        text: 'queue team-a: quota 288, limit 403, allocated 288, overQuotaWeight 1',
        cls: 'platform',
        row: 'P3',
        ref: rb(RB11, 50, 'RB-11 step 3: the queue'),
      },
      {
        t: 60,
        src: 'log',
        text: 'the job waits: no domain holds the gang, and the queue is at its quota',
        state: 'PENDING',
        row: 'P3',
      },
    ],
  },
  {
    id: 'exit-137',
    label: 'The job failed with exit 137, and nothing else',
    start: '22:10:00',
    story: [
      'Exit 137 is SIGKILL, not a cause.',
      'No Xid, no drain, and no OOMKilled reason: the evidence does not name a cause.',
      'The verdict is unattributed, and that is a result: the next checks are the pod events and the node conditions.',
    ],
    learn: { label: 'Handbook: the failure taxonomy', source: 'handbook/concepts.md:218' },
    events: [
      {
        t: 0,
        src: 'kubelet',
        text: 'container train: terminated with exit code 137',
        ref: { label: 'Handbook: exit 137 is SIGKILL, not a cause', source: 'handbook/concepts.md:218' },
        note: 'Exit 137 is SIGKILL: it does not vote.',
      },
      {
        t: 5,
        src: 'kubelet',
        text: 'last state: Terminated, reason Error, exit code 137, restartCount 2',
      },
      {
        t: 30,
        src: 'prometheus',
        text: 'peak memory 61 GiB of a 64 GiB limit; no metric sample in the last minute',
        note: 'Compare the observed peak with the limit, not the request.',
      },
      {
        t: 60,
        src: 'kubelet',
        text: 'node su1-n20: Ready, no pressure; no drain event',
        subject: 'su1-n20',
        node: 'su1-n20',
        state: 'FAILED',
      },
    ],
  },
  {
    id: 'slow-allreduce',
    label: 'The job is 20 % slow, and the health checks pass',
    start: '16:05:00',
    story: [
      'The step time is above the baseline of the job.',
      'The GPU is clean: no Xid, the ECC counters are 0, and there is no throttle.',
      'The link counters are not flat, so the fault is one cable (RB-04, row N2).',
    ],
    learn: rb(RB04, 55, 'RB-04 step 3: perfquery'),
    events: [
      {
        t: 0,
        src: 'prometheus',
        text: 'step time 118 ms against a 95 ms baseline; rank 5 is the straggler',
        ref: { label: 'A slow GPU with no error', source: 'handbook/runbook-catalog.md:89' },
      },
      {
        t: 60,
        src: 'log',
        text: 'nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE: counters 0, no throttle',
        subject: 'su1-n20/gpu4',
        node: 'su1-n20',
        ref: rb(RB03, 53, 'RB-03 step 2: the ECC and throttle check'),
        note: 'The node is clean: this event does not vote for the GPU.',
      },
      {
        t: 120,
        src: 'log',
        text: 'perfquery -x 0x1a4: SymbolErrorCounter rising on port 3',
        subject: 'su1-n20~r4',
        node: 'su1-n20',
        cls: 'fabric',
        row: 'N2',
        ref: rb(RB04, 55, 'RB-04 step 3: perfquery'),
      },
      {
        t: 180,
        src: 'log',
        text: 'the job continues, 20 % below its baseline',
        row: 'N2',
      },
    ],
  },
]

// The incident of the failures of the simulator, as they are now.
export const CURRENT_INCIDENT = 'current'

const KIND_CLASS: Record<FailKind, DiagClass> = {
  gpu: 'gpu',
  nvswitch: 'fabric',
  'switch-tray': 'fabric',
  nic: 'fabric',
  cable: 'fabric',
  leaf: 'fabric',
  spine: 'fabric',
  'storage-net': 'fabric',
  psu: 'sensor',
  bmc: 'sensor',
  cdu: 'sensor',
  pdu: 'sensor',
  'fabric-manager': 'software',
  nvlsm: 'software',
  imex: 'software',
  driver: 'software',
  ufm: 'software',
  vast: 'software',
  rafay: 'software',
  lb: 'software',
  firewall: 'software',
  dns: 'software',
  ntp: 'software',
  'device-plugin': 'platform',
}

const refOf = (source: string | undefined, label: string): DocRef | undefined => (source ? { label, source } : undefined)

// The events of the failures of the simulator: the alert of each failure, then the effect that its rule gives.
// A failure of the configuration gives two events; the class of the first one is the class of its kind.
export function eventsOf(config: Config, failures: Failure[]): DiagEvent[] {
  const out: DiagEvent[] = []
  let t = 0
  for (const f of failures) {
    if (!validFailure(config, f)) continue
    const kind = failKind(config, f.id)
    if (!kind) continue
    const rule = FAIL_RULES[kind].modes[f.mode]!
    const server = serverOf(f.id)
    const row = rule.runbook ? (rowOf(rule.runbook) ?? undefined) : undefined
    out.push({
      t,
      src: 'prometheus',
      text: `${rule.alert}: ${f.id}`,
      subject: f.id,
      ...(server ? { node: server } : {}),
      cls: KIND_CLASS[kind],
      ...(row ? { row } : {}),
      ...(rule.runbook ? { ref: rule.runbook } : {}),
    })
    const effect = refOf(rule.effect.source, rule.effect.value)
    out.push({
      t: t + 20,
      src: 'scheduler',
      text: `${DRAIN_LABEL[rule.drain]}; the owner: ${FAIL_RULES[kind].who.value}`,
      ...(server ? { subject: server, node: server } : {}),
      ...(rule.drain === 'node' ? { state: 'NODE_FAIL' as const } : {}),
      ...(effect ? { ref: effect } : {}),
    })
    t += 60
  }
  return out
}

export type IncidentView = Incident & { current: boolean }

// The incident of an id: a saved incident, or the failures of the simulator. Null for an unknown id.
export function incidentOf(id: string, config: Config, failures: Failure[]): IncidentView | null {
  if (id === CURRENT_INCIDENT) {
    const events = eventsOf(config, failures)
    return {
      id: CURRENT_INCIDENT,
      label: 'The failures of the simulator',
      start: '00:00:00',
      story: ['The events of the failures that you inject in Simulate mode, in the order of the simulator.'],
      events,
      learn: { label: 'Write the symptom chain in time order', source: 'handbook/concepts.md:217' },
      current: true,
    }
  }
  const found = INCIDENTS.find((x) => x.id === id)
  return found ? { ...found, current: false } : null
}

export const INCIDENT_BY_ID = new Map(INCIDENTS.map((x) => [x.id, x] as const))
