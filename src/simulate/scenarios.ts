import { DEFAULT_CONFIG, KEYS, type Config } from '../config/config'
import { withPatch } from '../config/rules'
import { serverId } from '../topology/ids'
import type { Failure } from './failable'

// The scenario library of spec 7.4. Each row sets its configuration (from the defaults), its failures, and the view
// that shows them: the node view of `server`, or the fabric with the SUs of `open` open.
// A step of a scenario with steps: a note, and the failures that the step adds to the steps before it.
export type SimStep = { note: string; failures: Failure[] }
// `narrative`: the story of the scenario, in the simulator bar. `steps`: the story in order; `failures` is the set of
// the failures of all the steps, so that the URL and the scenario list work as for a scenario with no steps.
export type SimScenario = {
  id: string
  label: string
  patch: Partial<Config>
  failures: Failure[]
  server: string | null
  open: number[]
  narrative?: string[]
  steps?: SimStep[]
}

const driverDown = (from: number, to: number): Failure[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ id: `${serverId(1, from + i)}/svc-driver`, mode: 'down' as const }))

export const SIM_SCENARIOS: SimScenario[] = [
  {
    id: 'fm-stops',
    label: 'Fabric Manager stops on one server: what do you drain?',
    patch: {},
    failures: [{ id: 'su1-n05/svc-fabric-manager', mode: 'down' }],
    server: 'su1-n05',
    open: [],
  },
  {
    id: 'link-ber',
    label: 'One link in 10 000 has a high symbol error rate',
    patch: {},
    failures: [{ id: 'su1-n10~r5', mode: 'degraded' }],
    server: null,
    open: [1],
  },
  {
    id: 'ufm-failover',
    label: 'The UFM master failed over at night',
    patch: {},
    failures: [{ id: 'blk-ufm', mode: 'active' }],
    server: null,
    open: [],
    narrative: [
      'During planned maintenance, the active UFM unit fails over to the standby unit.',
      'After the failover, the fabric is healthy.',
      'Some running jobs stopped with an NCCL timeout.',
      'RB-04 and the compute fabric concepts tell what a subnet manager failover does to running jobs.',
    ],
  },
  { id: 'leaf-single', label: 'A leaf goes down: single plane', patch: {}, failures: [{ id: 'su1-leaf-r3', mode: 'down' }], server: null, open: [1] },
  {
    id: 'leaf-dual',
    label: 'A leaf goes down: dual plane (Spectrum-X)',
    patch: { fabric: 'spectrum-x', planes: 'dual', suCount: 4 },
    failures: [{ id: 'su1-leaf-pA-r3', mode: 'down' }],
    server: null,
    open: [1],
  },
  {
    id: 'spine-down',
    label: 'A spine goes down',
    patch: {},
    failures: [{ id: 'spine-01', mode: 'down' }],
    server: null,
    open: [],
  },
  { id: 'rafay-down', label: 'The Rafay console is down, but the jobs run', patch: {}, failures: [{ id: 'blk-rafay', mode: 'down' }], server: null, open: [] },
  {
    id: 'pod-no-gpu',
    label: 'A pod is Running but has no GPU',
    patch: {},
    failures: [{ id: 'su1-n05/svc-device-plugin', mode: 'down' }],
    server: 'su1-n05',
    open: [],
  },
  {
    id: 'allreduce-40',
    label: 'A 512-GPU all-reduce gives 40 % of the expected bus bandwidth',
    patch: {},
    failures: [{ id: 'su1-n20~r2', mode: 'degraded' }],
    server: null,
    open: [1],
  },
  {
    id: 'partly-degraded',
    label: 'A cluster that is partly degraded',
    patch: {},
    failures: [
      { id: 'su1-n03/gpu4', mode: 'xid48' },
      { id: 'su1-n30~r6', mode: 'degraded' },
      { id: 'su1-n50/psu', mode: 'down' },
    ],
    server: null,
    open: [1],
  },
  {
    id: 'xid79',
    label: 'Xid 79 during a multi-node job: the GPU fell off the bus',
    patch: {},
    failures: [{ id: 'su1-n14/gpu3', mode: 'xid79' }],
    server: 'su1-n14',
    open: [],
  },
  {
    id: 'xid64-rma',
    label: 'Row remaps keep growing (Xid 63, 64): reset, or RMA?',
    patch: {},
    failures: [{ id: 'su1-n05/gpu5', mode: 'xid64' }],
    server: 'su1-n05',
    open: [],
  },
  {
    id: 'gpu-slow',
    label: 'A job is 20 % slow, and all health checks pass',
    patch: {},
    failures: [{ id: 'su1-n22/gpu6', mode: 'degraded' }],
    server: null,
    open: [1],
  },
  {
    id: 'pfc-storm',
    label: 'RoCE storage: I/O latency above 200 ms, no link down',
    patch: { storageFabric: 'ethernet' },
    failures: [{ id: 'blk-storage-net', mode: 'degraded' }],
    server: null,
    open: [],
  },
  {
    id: 'vast-slow',
    label: 'Checkpoints are slow, but "VAST is healthy"',
    patch: {},
    failures: [{ id: 'blk-vast', mode: 'degraded' }],
    server: null,
    open: [],
  },
  {
    id: 'os-patch',
    label: 'After an OS patch, the driver fails on many nodes',
    patch: {},
    failures: driverDown(1, 40),
    server: null,
    open: [1],
    narrative: ['A routine OS patch went to the fleet.', 'Count the failures at each step.', 'The fault count follows the method of the layer model.'],
    steps: [
      { note: 'one node fails the DCGM diagnostic after the patch', failures: driverDown(1, 1) },
      { note: 'seven more nodes, the same error', failures: driverDown(2, 8) },
      { note: '40 nodes, the same error', failures: driverDown(9, 40) },
    ],
  },
  {
    id: 'rack-power-storm',
    label: 'A rack power event during a false alert storm',
    patch: {},
    failures: [{ id: 'su1-k1-pdu1', mode: 'down' }],
    server: null,
    open: [1],
    narrative: [
      'The simulator shows the real event: the power of one rack.',
      'It does not show the false alerts of a bad exporter rollout.',
      'It does not show the 12 nodes that auto-remediation cordoned.',
    ],
  },
  {
    id: 'cdu-drain',
    label: 'A CDU fails: drain before the thermal shutdown',
    patch: { cooling: 'liquid' },
    failures: [{ id: 'su1-cdu', mode: 'down' }],
    server: null,
    open: [1],
    narrative: [
      'In this scenario, the coolant flow drops, and the GPUs throttle.',
      'The racks reach an emergency thermal shutdown in about 10 minutes (see RB-10).',
      'RB-10 gives the drain sequence and the customer message.',
      'The simulator takes out all racks of the SU, because it has one CDU for each SU.',
    ],
  },
]

const failuresKey = (fs: Failure[]) => fs.map((f) => `${f.id}:${f.mode}`).sort().join(',')

// The failures of the steps up to `step` (clamped to the last step); all the failures for a scenario with no steps.
export function stepFailures(sc: SimScenario, step: number): Failure[] {
  if (!sc.steps) return sc.failures
  return sc.steps.slice(0, Math.max(0, step) + 1).flatMap((x) => x.failures)
}

// The scenario and the step of a set of failures and a configuration: a scenario with steps matches the failures
// of each of its steps; null after any other change.
export function activeSimStep(failures: Failure[], config: Config): { scenario: SimScenario; step: number | null } | null {
  if (failures.length === 0) return null
  const k = failuresKey(failures)
  for (const sc of SIM_SCENARIOS) {
    const c = withPatch(DEFAULT_CONFIG, sc.patch)
    if (c === null || !KEYS.every((key) => c[key] === config[key])) continue
    if (!sc.steps) {
      if (failuresKey(sc.failures) === k) return { scenario: sc, step: null }
      continue
    }
    const step = sc.steps.findIndex((_, i) => failuresKey(stepFailures(sc, i)) === k)
    if (step >= 0) return { scenario: sc, step }
  }
  return null
}

// The scenario of a set of failures (in any order) and a configuration, at any of its steps; null after a change.
export function activeSimScenario(failures: Failure[], config: Config): SimScenario | null {
  return activeSimStep(failures, config)?.scenario ?? null
}
