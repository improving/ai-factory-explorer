import type { DocRef } from './component-docs'
import { assumed, confirmed } from './fact'

const PERF = 'https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md'
const DEMYSTIFY = 'https://arxiv.org/abs/2507.04786'
const NCCL_ENV = 'https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/env.html'
const TREE_BLOG = 'https://developer.nvidia.com/blog/massively-scale-deep-learning-training-nccl-2-4'
const NVLS_NOTES = 'https://docs.nvidia.com/deeplearning/nccl/release-notes/rel_2-17-1.html'
const PAT_BLOG = 'https://developer.nvidia.com/blog/new-scaling-algorithm-and-initialization-with-nvidia-collective-communications-library-2-23'
const P2P_GUIDE = 'https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/usage/p2p.html'
const PXN_BLOG = 'https://developer.nvidia.com/blog/doubling-all2all-performance-with-nvidia-collective-communication-library-2-12/'
const PAPER = 'https://arxiv.org/html/2507.04786'

// The facts of Collectives mode (sourcing notes: docs/superpowers/specs/2026-10-14-ai-factory-explorer-m10-sourcing.md and
// 2026-10-14-ai-factory-explorer-m11-sourcing.md). A confirmed fact says only what its source says.
export const COLL_FACTS = {
  busFactor: {
    allreduce: confirmed('2(n-1)/n', undefined, PERF),
    allgather: confirmed('(n-1)/n', undefined, PERF),
    reducescatter: confirmed('(n-1)/n', undefined, PERF),
    alltoall: confirmed('(n-1)/n', undefined, PERF),
    broadcast: confirmed('1', undefined, PERF),
  },
  busbwMeaning: confirmed('busbw = algbw × the bus factor, so that you can compare it directly with the speed of the slowest link', undefined, PERF),
  ringSteps: confirmed('a ring AllReduce is n-1 reduce-scatter steps, then n-1 all-gather steps; in each step, each rank sends one chunk', undefined, DEMYSTIFY),
  ringOrder: assumed(
    '2 nodes: GPU 0 to 7 on node A, rail 7 to node B, GPU 7 to 0 on node B, rail 0 back to node A',
    undefined,
    'NCCL builds its rings from the topology that it finds; no page gives the order for these servers. This order crosses between the nodes on one rail at each end.',
    DEMYSTIFY,
  ),
  channels: assumed(
    'the canvas draws one channel at a time, or all of them',
    undefined,
    'NCCL runs a number of rings (channels) at the same time, each crossing on another rail, so that all NICs carry data. The app draws channel c with the order of its model; NCCL_DEBUG=INFO shows the real rings.',
    NCCL_ENV,
  ),
  algorithm: assumed(
    'the limit is for the algorithm in the bar',
    undefined,
    'NCCL selects the algorithm at run time (NCCL_ALGO: Ring, Tree, NVLS, PAT, and others). Set NCCL_ALGO to the same algorithm to compare, for example NCCL_ALGO=Ring. On one NVSwitch node, NCCL can select NVLS for AllReduce, which gives more than the ring limit.',
    NCCL_ENV,
  ),
  channelLimit: assumed(
    'on 2 nodes, the limit counts 8 channels, one through each NIC',
    undefined,
    'NCCL runs a number of rings at the same time, and "each channel can independently exit the node through a different NIC". So each NIC carries 1/8 of the bytes, and the limit is 8 × the NIC speed, or the NVLink speed if that is lower. The count of 8 (one ring for each compute NIC) is the model of the app; NCCL_DEBUG=INFO gives the real number of channels.',
    DEMYSTIFY,
  ),
  latency: assumed('no latency model', undefined, 'At small sizes, the latency controls the time, so the measured busbw is lower than the limit. The app gives the bandwidth limit only.', PERF),
  dualPlane: assumed('the limit is for one plane', undefined, 'The tracer takes one plane. NCCL can use the two planes of a dual-plane fabric; then the limit can be up to 2 times this value.'),
  nvswitchRing: assumed(
    'on 1 node, all ring edges go through the same NVSwitch chips',
    undefined,
    'The ring is logical: on an NVSwitch node, each GPU reaches each other GPU at the full NVLink bandwidth, so the ring order does not change the limit.',
  ),
  model: assumed(
    'the limit comes from the bytes on each link',
    undefined,
    'The app adds the bytes of each send on each link of its path, over all steps; the busiest link sets the time. It leaves out the latency of each step, the pipeline fill, and the protocol (LL, LL128, Simple).',
  ),
  treeHalves: confirmed('each of the two trees carries half of the data', undefined, TREE_BLOG),
  treeLatency: confirmed('a tree has a logarithmic latency; the latency of a ring grows with the number of GPUs', undefined, TREE_BLOG),
  treeChain: confirmed('inside a node, NCCL links the GPUs in a chain; the trees branch only across nodes', undefined, PAPER),
  treeShape: assumed(
    'the shape of the two trees',
    undefined,
    'Tree 1: the odd ranks are the leaves. Tree 2 is the mirror of tree 1, as the paper says for an even number of nodes. NCCL builds the trees in src/graph/trees.cc; the app does not copy that code.',
    PAPER,
  ),
  treePipeline: confirmed('NCCL runs the Tree AllReduce as a pipeline', undefined, PAPER),
  treePhases: assumed('the app shows the Reduce and the Broadcast phases one after the other', undefined, 'NCCL pipelines them, so they overlap in time. The limit of the app does not depend on the order: it is a bandwidth limit.'),
  nvlsIntraNode: confirmed('NVLS: NVLink SHARP reduction and broadcast, for AllReduce inside a node', undefined, NVLS_NOTES),
  nvlsLimit: assumed(
    'the NVLS limit is 2(n-1)/n × the NVLink speed',
    undefined,
    'With NVLS, each GPU sends its data once and receives the sum once: the NVSwitch chips do the addition. So the busbw of nccl-tests can be above the speed of the link. No NVIDIA page gives this figure; the app derives it from its link model.',
  ),
  patBruck: confirmed('PAT is based on the Bruck algorithm, for AllGather and ReduceScatter, with logarithmic scaling', undefined, PAT_BLOG),
  patOneGpu: confirmed('PAT first supports one GPU per node', undefined, PAT_BLOG),
  patSteps: assumed(
    'the app shows the steps of the Bruck algorithm',
    undefined,
    'The blog gives "a binomial tree shifted for each rank", not the steps. The Bruck steps take log2 N steps, with the same bytes on each link as the ring.',
    PAT_BLOG,
  ),
  p2pPattern: confirmed('NCCL runs AlltoAll as grouped send and receive operations to and from all peers', undefined, P2P_GUIDE),
  pxn: confirmed('PXN moves the data over NVLink to the GPU on the rail of the destination, then over the network on that rail', undefined, PXN_BLOG),
  p2pNodeShare: assumed(
    'on 2 nodes, half of the bytes stay inside the node',
    undefined,
    'Each rank sends one chunk to each of the other 15 ranks; the 7 ranks on its own node get theirs over NVLink. So only half of the bytes cross a NIC, and the busbw can be above the NIC speed.',
  ),
  p2pOrder: assumed('the order of the sends', undefined, 'NCCL starts all sends of an AlltoAll in one group. The app sends to rank r + s at step s, to show them one step at a time.'),
  broadcastChain: confirmed('Broadcast: a chain from the root through each GPU', undefined, PAPER),
  broadcastChunks: assumed('8 chunks in the pipeline', undefined, 'NCCL cuts the data into many more chunks. The limit of the app does not depend on the number of chunks: it is a bandwidth limit.'),
  readerThreshold: assumed(
    'the default threshold of the reader is 80 % of the limit',
    undefined,
    'No source gives a pass mark. The limit leaves out the latency and the protocol, so a good run is below it. Set the threshold to the acceptance number of your hardware (the collectives lab step 5).',
  ),
}

// The Learn links of Collectives mode.
export const COLL_LEARN: DocRef[] = [
    { label: 'SimCCL lab 05: AllReduce message sweep', source: 'handson/SimAI_SimCCL_55_B300_Reference_Architecture_Labs.md:655' },
  { label: 'SimCCL lab 06: AllGather', source: 'handson/SimAI_SimCCL_55_B300_Reference_Architecture_Labs.md:696' },
  { label: 'SimCCL lab 07: ReduceScatter', source: 'handson/SimAI_SimCCL_55_B300_Reference_Architecture_Labs.md:713' },
  { label: 'nccl-tests PERFORMANCE.md: algbw and busbw', source: PERF },
  { label: 'RB-02: NCCL init hang and slow transport', source: 'runbooks/RB-02-nccl-init-hang-slow-transport.md' },
]
