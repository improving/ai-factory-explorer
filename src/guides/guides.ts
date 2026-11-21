// The in-app guides (spec: docs/superpowers/specs/2026-10-15-explorer-guides-design.md).
// A step gives the link of its view (the text after # in the address bar). Copy it from the address bar.
// Each number with GB/s or % in a text needs a check: the tests compare it with the screen.

export type GuideAction = 'reader-good' | 'reader-slow' | 'reader-errors' | 'reader-clear'
export type GuideCheck = { testid: string; text: string }
export type GuideStep = { title: string; look: string; lesson?: string; hash: string; target?: string; action?: GuideAction; checks?: GuideCheck[] }
export type Guide = { id: string; title: string; goal: string; steps: GuideStep[] }

const RING_1N = 'mode=collectives&coll=allreduce.ring.1n'
const RING_2N = 'mode=collectives&coll=allreduce.ring.2n.0.1g'
const PLAN = 'mode=collectives&coll=allreduce.ring.1n.0.1g&cview=par&par=4.8.1.1.4.1'

export const GUIDES: Guide[] = [
  {
    id: 'first',
    title: 'First tour',
    goal: 'See the parts of the AI factory, and how to move between the views.',
    steps: [
      {
        title: 'The fabric of one SU',
        look: 'This is one SU of DGX B300 servers. Each server connects to 8 rails. Each rail goes to its own leaf, and the leaves connect to the spines.',
        lesson: 'Each GPU has its own NIC, on its own rail.',
        hash: '',
        checks: [{ testid: 'breadcrumb', text: 'Pod' }],
      },
      {
        title: 'A leaf',
        look: 'The leaf of rail 0 is selected. The inspector shows its specs, its failure signals, and the documents to read. Click any part to see it in the inspector.',
        hash: 'sel=su1-leaf-r0',
        target: 'inspector-title',
        checks: [{ testid: 'inspector-title', text: 'SU1 rail 0' }],
      },
      {
        title: 'Inside a server',
        look: 'This is the node view of one server: 8 GPUs, the NVSwitch chips, and the NICs. Double-click a server in the fabric to open it.',
        lesson: 'Inside a server, the GPUs talk over NVLink. Between servers, they talk over the NICs.',
        hash: 'server=su1-n01',
        checks: [{ testid: 'breadcrumb', text: 'su1-n01' }],
      },
      {
        title: 'The factory overview',
        look: 'Each network of the factory is one block: compute, storage, management, and the others. Click "Factory" in the breadcrumb, or press Esc in the fabric, to come here.',
        hash: 'view=overview',
        checks: [{ testid: 'breadcrumb', text: 'Factory' }],
      },
      {
        title: 'A rack and its port map',
        look: 'This is the front of rack 1. The port map under it lists each cable: the two ends, the ports, and the optics.',
        hash: 'racks=1&rack=su1-k1&face=front',
        target: 'portmap',
        checks: [{ testid: 'portmap', text: 'Port map' }],
      },
      {
        title: 'The same map from three sources',
        look: 'The port map compares the reference design with the site intent and with the discovery. This is the discovery of the same rack: the app names the cables that differ.',
        lesson: 'A difference between the design and the discovery is a documentation error or an unrecorded change.',
        hash: 'racks=1&rack=su1-k1&face=front&tsrc=discovered',
        target: 'portmap-diff',
        checks: [{ testid: 'portmap-diff', text: '3 of 32 cables differ' }],
      },
      {
        title: 'The same fabric over a week',
        look: 'The time view colours the fabric by the state at the cursor. This is day 3 at 02:45: 42 of the 72 hosts are in the firmware window. The bar has the events of the week, and the Lifecycle tab has the events of this host.',
        lesson: 'A state is a moment of a history: this host is in use, in maintenance, and in use again 22 minutes later.',
        hash: 'tw=7d&t=3045&color=state&open=1&sel=su1-n05&itab=lifecycle',
        target: 'lifecycle-history',
        checks: [
          { testid: 'lifecycle-state', text: 'In repair or maintenance' },
          { testid: 'lifecycle-history', text: 'drained for the firmware window' },
        ],
      },
      {
        title: 'Search and share',
        look: 'Press / to search for a part or a runbook. "Copy link" in the header gives this exact view to another person.',
        hash: '',
        target: 'search',
      },
    ],
  },
  {
    id: 'trace',
    title: 'Trace a GPU-to-GPU path',
    goal: 'See the path between two GPUs, and why a longer path has more parts that can fail.',
    steps: [
      {
        title: 'Two GPUs in one server',
        look: 'GPU 0 and GPU 5 are in the same server. The path goes over NVLink, through the NVSwitch chips. It does not use a NIC.',
        hash: 'mode=trace&trace=su1-n01/gpu0,su1-n01/gpu5&view=trace',
        target: 'trace-status',
        checks: [{ testid: 'trace-status', text: 'Same node' }],
      },
      {
        title: 'The same rail',
        look: 'GPU 0 of two servers: the path goes from the NIC on rail 0, through one leaf, to the NIC on rail 0 of the other server.',
        hash: 'mode=trace&trace=su1-n01/gpu0,su1-n02/gpu0&view=trace',
        target: 'trace-status',
        checks: [{ testid: 'trace-status', text: 'One leaf' }],
      },
      {
        title: 'Another rail: PXN',
        look: 'GPU 0 to GPU 1 of another server: NCCL first moves the data over NVLink to GPU 1 of this server, then sends it on rail 1. This is PXN.',
        hash: 'mode=trace&trace=su1-n01/gpu0,su1-n02/gpu1&view=trace',
        target: 'trace-status',
        checks: [{ testid: 'trace-status', text: 'PXN' }],
      },
      {
        title: 'Two SU groups: the spine',
        look: 'These two servers are in different groups of SUs. The path goes up to a spine and down again.',
        hash: 'su=2&mode=trace&trace=su1-n01/gpu7,su2-n01/gpu7&view=trace',
        target: 'trace-status',
        checks: [{ testid: 'trace-status', text: 'through a spine' }],
      },
      {
        title: 'The hops and the bottleneck',
        look: 'The hop table lists each hop: the link, its bandwidth, and the runbook to read. The slowest hop is the bottleneck.',
        lesson: 'A longer path has more parts that can fail.',
        hash: 'su=2&mode=trace&trace=su1-n01/gpu7,su2-n01/gpu7&view=trace',
        target: 'hop-table',
        checks: [{ testid: 'hop-table', text: '6 hops' }],
      },
    ],
  },
  {
    id: 'simulate',
    title: 'Simulate a failure',
    goal: 'Fail a part, and see what it hits: the GPUs, the alerts, the owners, and the runbooks.',
    steps: [
      {
        title: 'A NIC down',
        look: 'NIC 0 of su1-n01 is down. The impact panel shows the GPUs out, the alerts, and the incident. To fail another part, select it, then press Fail in the inspector.',
        hash: 'mode=simulate&fail=su1-n01/nic0:down',
        target: 'impact',
        checks: [{ testid: 'impact', text: '1 GPU out' }],
      },
      {
        title: 'A GPU with Xid 79',
        look: 'Xid 79 means that the GPU fell off the bus. You must drain the node immediately, so all 8 GPUs of the node are out.',
        hash: 'mode=simulate&fail=su1-n05/gpu2:xid79',
        target: 'impact',
        checks: [{ testid: 'impact', text: '8 GPUs out' }],
      },
      {
        title: 'The verdict of the failure',
        look: 'The bar switches the bottom panel to Diagnose: the events of the failure in time order, and the verdict that they support. This Xid 79 is a hardware class on one node, and the chain names the first cause.',
        lesson: 'The chain is the evidence; the verdict is the summary.',
        hash: 'mode=simulate&dv=chain&fail=su1-n05/gpu2:xid79&open=1',
        target: 'diag-verdict',
        checks: [{ testid: 'diag-verdict', text: 'hardware: GPU on su1-n05' }],
      },
      {
        title: 'The checklist of the runbook',
        look: 'The runbook of the chain opens as a checklist: the read-only steps of its first 5 minutes, then one mitigation row with its gate and its undo. "Export the timeline" gives the skeleton of the postmortem.',
        hash: 'mode=simulate&dv=chain&fail=su1-n05/gpu2:xid79&ck=RB-03&open=1',
        target: 'checklist-progress',
        checks: [{ testid: 'checklist-progress', text: '0 of 4 steps done.' }],
      },
      {
        title: 'A degraded cable',
        look: 'The cable of rail 7 of su1-n01 has a high bit error rate. No GPU is out, but its path is slow.',
        hash: 'mode=simulate&fail=su1-n01~r7:degraded',
        target: 'impact',
        checks: [{ testid: 'impact', text: '0 GPUs out' }],
      },
      {
        title: 'A leaf down',
        look: 'The leaf of rail 3 is down. Each server of the SU loses rail 3, so 72 GPUs are out.',
        lesson: 'How far a failure reaches depends on where the part is.',
        hash: 'mode=simulate&fail=su1-leaf-r3:down',
        target: 'impact',
        checks: [{ testid: 'impact', text: '72 GPUs out' }],
      },
      {
        title: 'Repair and reset',
        look: 'Repair one part in the inspector, or press Reset in the bar to repair all parts. The scenario list in the bar has more failures to try.',
        hash: 'mode=simulate',
        target: 'sim-reset',
      },
    ],
  },
  {
    id: 'collectives',
    title: 'Collectives basics',
    goal: 'See how a ring AllReduce moves data, and which link sets its busbw limit.',
    steps: [
      {
        title: 'The four parts of the screen',
        look: 'The diagram at the top has one circle for each GPU. The canvas shows the real links. The strip at the bottom shows what each GPU holds. The inspector gives the busbw limit.',
        hash: `${RING_1N}.0.1g`,
        target: 'ring-diagram',
        checks: [{ testid: 'coll-step', text: 'Step 0 of 14' }],
      },
      {
        title: 'Half way: a ReduceScatter',
        look: 'Use Next, or the arrow keys, to step. At step 7, each GPU holds the full sum of one chunk.',
        lesson: 'AllReduce is a ReduceScatter followed by an AllGather.',
        hash: `${RING_1N}.7.1g`,
        target: 'buffer-strip',
        checks: [{ testid: 'coll-step', text: 'Step 7 of 14' }],
      },
      {
        title: 'The end: NVLink is the limit',
        look: 'At step 14, each GPU holds all the sums. On 1 node, the limit is 900 GB/s, and the bottleneck is an NVLink link.',
        hash: `${RING_1N}.14.1g`,
        target: 'busbw-limit',
        checks: [
          { testid: 'busbw-limit', text: '900.0 GB/s' },
          { testid: 'busbw-bottleneck', text: 'NVLink' },
        ],
      },
      {
        title: '2 nodes: the NICs are the limit',
        look: 'On 2 nodes, the ring crosses the NICs. NCCL runs 8 rings (channels) at the same time, one through each NIC, so the limit is 8 × 100 GB/s = 800 GB/s.',
        hash: RING_2N,
        target: 'coll-channel',
        checks: [
          { testid: 'busbw-limit', text: '800.0 GB/s' },
          { testid: 'busbw-bottleneck', text: '8 channels × 100.0 GB/s' },
        ],
      },
      {
        title: 'All channels, and your number',
        look: 'With "All channels", the canvas shows the 8 NICs busy. Type the busbw of your nccl-tests run in "Your busbw" to see it as a percentage of the limit.',
        hash: `${RING_2N}.call`,
        target: 'busbw-measured',
      },
      {
        title: 'A NIC down',
        look: 'NIC 7 of su1-n01 is down. Ranks 7 and 8 have no path, so the collective cannot finish.',
        lesson: 'One bad link stops the full collective.',
        hash: `${RING_2N}&fail=su1-n01/nic7:down`,
        target: 'busbw-none',
        checks: [{ testid: 'busbw-none', text: 'No path from rank 7 to rank 8' }],
      },
    ],
  },
  {
    id: 'reader',
    title: 'Read nccl-tests output',
    goal: 'Paste the output of nccl-tests, and see each size against the limit, with the failures marked.',
    steps: [
      {
        title: 'A good run',
        look: 'This is the output of all_reduce_perf on 2 nodes. The largest size gives 671 GB/s: 84 % of the 800 GB/s limit, at or above the threshold of 80 %.',
        hash: RING_2N,
        action: 'reader-good',
        target: 'nccl-chart',
        checks: [
          { testid: 'nccl-marks', text: '671.0 GB/s = 84 % of the limit' },
          { testid: 'nccl-marks', text: 'threshold (80 %)' },
          { testid: 'nccl-limit', text: '800.0 GB/s' },
        ],
      },
      {
        title: 'A slow run',
        look: 'This run gives 400 GB/s at the largest size: 50 % of the limit, below the threshold. The mark links to RB-02, to find the slow node pair and the transport.',
        hash: RING_2N,
        action: 'reader-slow',
        target: 'nccl-marks',
        checks: [
          { testid: 'nccl-marks', text: '400.0 GB/s = 50 % of the limit' },
          { testid: 'nccl-marks', text: 'RB-02' },
        ],
      },
      {
        title: 'Data errors',
        look: '#wrong is more than 0 at one size, and the out of bounds check FAILED. The collective gave wrong results: stop the jobs on these GPUs, and follow RB-03.',
        hash: RING_2N,
        action: 'reader-errors',
        target: 'nccl-marks',
        checks: [{ testid: 'nccl-marks', text: 'RB-03' }],
      },
      {
        title: 'Your own output',
        look: 'Run nccl-tests with the default columns, and paste the full output of one test here. The text stays in this page: it does not go into the URL.',
        hash: RING_2N,
        action: 'reader-clear',
        target: 'nccl-input',
      },
    ],
  },
  {
    id: 'parallelism',
    title: 'Map a training job',
    goal: 'See which GPUs talk together in a training job, with which collective, and on which network.',
    steps: [
      {
        title: 'The plan and the grid',
        look: 'The job is TP 8 × DP 4 on 4 servers: 32 GPUs. The grid has one row for each server. The table in the inspector gives each dimension: the groups, the collective, and the network.',
        hash: `${PLAN}.tp`,
        target: 'par-grid',
        checks: [{ testid: 'par-table', text: 'NVLink (one server)' }],
      },
      {
        title: 'A DP group',
        look: 'DP is selected, and GPU 3 of su1-n02 (rank 11) is selected. Its DP group is GPU 3 of each server: the same rail, through one leaf.',
        hash: `${PLAN}.dp.c11`,
        target: 'par-grid',
        checks: [{ testid: 'par-table', text: 'one leaf (same rail)' }],
      },
      {
        title: 'Play the DP group',
        look: '"Play this group" opens Collective view with this group: a ring AllReduce on 4 GPUs. The limit is 100 GB/s, set by one NIC.',
        hash: 'mode=collectives&par=4.8.1.1.4.1.dp.c11&coll=allreduce.ring.group.0.1g.gdp3',
        target: 'busbw-limit',
        checks: [{ testid: 'busbw-limit', text: '100.0 GB/s' }],
      },
      {
        title: 'Play a TP group',
        look: 'A TP group is one server: 8 GPUs on NVLink. The limit is 900 GB/s.',
        hash: 'mode=collectives&par=4.8.1.1.4.1.tp.c0&coll=allreduce.ring.group.0.1g.gtp0',
        target: 'busbw-limit',
        checks: [{ testid: 'busbw-limit', text: '900.0 GB/s' }],
      },
      {
        title: 'A bad plan: TP across servers',
        look: 'With TP 16 and DP 2, each TP group has 2 servers, so TP crosses the NICs. The table shows "one leaf, with PXN" for TP.',
        lesson: 'In the usual plan, TP stays in the NVLink domain.',
        hash: 'mode=collectives&coll=allreduce.ring.1n.0.1g&cview=par&par=4.16.1.1.2.1.tp',
        target: 'par-table',
        checks: [{ testid: 'par-table', text: 'one leaf, with PXN' }],
      },
      {
        title: 'A failed GPU',
        look: 'GPU 3 of su1-n02 has Xid 79. The inspector names its groups. A collective waits for each member, so one lost GPU stops its groups, and so the full job.',
        hash: `${PLAN}.dp.c11&fail=su1-n02/gpu3:xid79`,
        target: 'par-failures',
        checks: [{ testid: 'par-failures', text: 'one lost GPU stops its groups' }],
      },
    ],
  },
  {
    id: 'schedule',
    title: 'See why a job waits',
    goal: 'Set a job, and read the decision path: the queue, the quota, the gang, the topology, and the segments. Then run the fleet at load.',
    steps: [
      {
        title: 'A placed job',
        look: 'Schedule mode sets a job and shows the decision path. This job fits: 32 GPUs on 4 servers, in one rack.',
        hash: 'mode=schedule&open=1&sc=team-a.32.build.all.any.rack.1',
        target: 'sched-panel',
        checks: [{ testid: 'sched-result', text: 'Placed 32 GPUs' }],
      },
      {
        title: 'The quota of a non-preemptible job',
        look: 'A non-preemptible job stays inside the quota of its queue. The queue row is red, and the bar gives the reason in one sentence.',
        lesson: 'Priority is not preemption: the preemption policy is a separate field.',
        hash: 'mode=schedule&open=1&sc=team-a.400.build.all.any.rack.1',
        target: 'sched-step-priority',
        checks: [{ testid: 'sched-result', text: 'Non-preemptible work stays in quota' }],
      },
      {
        title: 'The same job, preemptible',
        look: 'A preemptible job may use the limit, over the quota. It passes the quota gate, and then the free GPUs stop it.',
        hash: 'mode=schedule&open=1&sc=team-a.400.train.all.any.rack.1',
        checks: [{ testid: 'sched-result', text: 'Only 280 GPUs are free' }],
      },
      {
        title: 'The topology level',
        look: 'A required level of one node blocks a job of 16 GPUs: no node has them. The topology row names the largest domain that fits.',
        hash: 'mode=schedule&open=1&sc=team-a.16.build.all.node.rack.1',
        target: 'sched-step-topology',
        checks: [{ testid: 'sched-result', text: 'No one node has 16 free GPUs' }],
      },
      {
        title: 'The segments',
        look: 'Two segments put half of the job in each of two racks. The panel lists the domain and the GPUs of each segment, and the runbook of a pending job is RB-11.',
        hash: 'mode=schedule&open=1&sc=team-a.32.build.all.rack.rack.2',
        target: 'sched-panel',
        checks: [{ testid: 'sched-panel', text: 'Segment 2: 16 GPUs' }],
      },
      {
        title: 'The load at scale',
        look: 'The Load view runs 30 minutes of jobs on a fleet of 4,608 servers. This is the second 25:00: 128 GPUs wait in 2 jobs, and 35,232 run. The two charts show the whole run, and the tiles show each rack of the fleet at the cursor.',
        lesson: 'A fleet at half its capacity has no queue; near its capacity the queue fills, and the latency follows it. The rate and the seed are the controls: the same seed gives the same run.',
        hash: 'mode=schedule&open=1&sc=team-a.32.build.all.any.rack.1&sv=load&lt=1500',
        target: 'load-panel',
        checks: [
          { testid: 'load-clock', text: '25:00' },
          { testid: 'load-numbers', text: '35,232' },
        ],
      },
    ],
  },
]
