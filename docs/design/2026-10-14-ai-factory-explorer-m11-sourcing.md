# AI Factory Explorer, milestones 11 and 12: sourcing note

**Use:** the sources of the facts of the new algorithms (milestone 11a), the `nccl-tests` reader (11b), and the parallelism mapper (12).
**Design:** [the design of milestones 11 and 12](2026-10-14-collectives-m11-m12-design.md).
**Method:** each quote is verbatim from the page, read on 2026-10-14.
A fact with no quote here is `assumed` in the app, with a note.

## 1. nccl-tests: the bus factors and the size column

Source: [nccl-tests PERFORMANCE.md](https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md).

| Collective | Bus factor | Quote or code |
|------------|------------|---------------|
| AllReduce | `2(n-1)/n` | "`B = S/t * (2*(n-1)/n) = algbw * (2*(n-1)/n)`" |
| ReduceScatter | `(n-1)/n` | the Summary list |
| AllGather | `(n-1)/n` | the Summary list |
| Broadcast | `1` | "*all* data has to get out of the root rank … `t = S/B`" |
| AlltoAll | `(n-1)/n` | the Summary list; `src/alltoall.cu`: `factor = ((double)(nranks-1))/((double)(nranks))` |
| SendRecv | `1` | not in PERFORMANCE.md; [`src/sendrecv.cu`](https://github.com/NVIDIA/nccl-tests/blob/master/src/sendrecv.cu): `double factor = 1;` |

- The size of AllGather and ReduceScatter is the total array:
  "S is the size in bytes of the total array, which for NCCL is equal to `recvcount*sizeof(datatype)*n`".
- The size of AlltoAll is the total send buffer of one rank; each peer gets size/n (`src/alltoall.cu`).
- "The bus bandwidth should reflect the speed of the hardware bottleneck : NVLink, PCI, QPI, or network."
- AllReduce: "this is independent of the algorithm used (ring, tree, or other) as long as they use point-to-point operations (send/receive)."

## 2. nccl-tests: the output format

Source: [`src/util.cu`](https://github.com/NVIDIA/nccl-tests/blob/master/src/util.cu), the print code.

- The header lines: `# nThread %d nGpus %d minBytes %ld maxBytes %ld step: …`, `# Using devices`, and one line for each rank: `#  Rank %2d Group %2d Pid %6d on %10s device %2d [%04x:%02x:%02x] %s`.
- The table header: a line with the labels "out-of-place" and "in-place"; then `size count type redop root time algbw busbw #wrong time algbw busbw #wrong`; then the units `(B) (elements) … (us) (GB/s) (GB/s)`.
- A row: `size count type redop root`, then `time algbw busbw #wrong` for out-of-place and again for in-place.
- The footer: `# Out of bounds values : %d OK/FAILED`, `# Avg bus bandwidth : %g`.
- Optional columns come with options (`i_min i_max i_p99 i_cv%`; `impl algo proto …`). The reader of 11b reads the default columns and refuses others with a message.

## 3. NCCL: the algorithms and the protocols

Source: [the NCCL environment variables](https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/env.html).

- `NCCL_ALGO`: "2.5+ Ring; 2.5+ Tree; … 2.14+ CollnetChain; 2.14+ CollnetDirect; 2.17+ NVLS; 2.18+ NVLSTree; 2.23+ PAT".
- "NVLS and NVLSTree enable NVLink SHARP offload."
- "The default is unset, which causes NCCL to automatically choose the available algorithms based on the node topology and architecture."
- `NCCL_PROTO`: "LL , LL128 , and Simple".
- `NCCL_CROSS_NIC`: "NCCL tries to use the same NICs when communicating between nodes, to allow for a network design where each NIC on a node connects to a different network switch (network rail)".
- `NCCL_PXN_DISABLE`: "Disable inter-node communication using a non-local NIC, using NVLink and an intermediate GPU."

## 4. Tree (double binary trees)

Sources: [the NCCL 2.4 blog](https://developer.nvidia.com/blog/massively-scale-deep-learning-training-nccl-2-4) and [Demystifying NCCL](https://arxiv.org/html/2507.04786).

- "The downside of rings is that latency scales linearly with the number of GPUs".
- "double binary trees, which offer full bandwidth and a logarithmic latency".
- "we can build a second tree using leaves as nodes and vice-versa for each binary tree. There might be one rank which is a leaf on both trees but no rank is a node on both trees."
- "If we use each of the two trees to process half of the data, each rank will at most receive half of the data twice and send half of the data twice, which is as optimal as rings".
- The paper: "the branching structure is built only across nodes. Inside each node, NCCL links the local GPUs in a simple chain."
- The paper: the second tree is "constructed by mirroring the first when the number of nodes is even, or by a one-position shift when it is odd."
- The paper: a Tree AllReduce is "a Reduce phase followed by a Broadcast phase".
- The paper: "The Tree AllReduce, Ring Broadcast, and Ring Reduce algorithms in NCCL follow a pipelined execution pattern."

## 5. NVLS (NVLink SHARP)

- [NCCL 2.17.1 release notes](https://docs.nvidia.com/deeplearning/nccl/release-notes/rel_2-17-1.html): "Add support for NVLink SHARP Reduction / Broadcast to accelerate intra-node allreduce operations."
- [NCCL 2.18.1 release notes](https://docs.nvidia.com/deeplearning/nccl/release-notes/rel_2-18-1.html): "Add inter-node algorithms for NVLink SHARP: NVLink SHARP + IB SHARP (NVLS), NVLink SHARP + Tree (NVLSTREE)."
- The paper: "NVLS and CollNet are specialized algorithms primarily designed to optimize AllReduce performance, with NVLS also offering support for ReduceScatter and AllGather".
- **Not sourced:** the multimem mechanics, and any NVLS bandwidth figure. The app derives the NVLS limit from its own traffic model and marks it `assumed`.

## 6. PAT (Parallel Aggregated Trees)

Source: [the NCCL 2.23 blog](https://developer.nvidia.com/blog/new-scaling-algorithm-and-initialization-with-nvidia-collective-communications-library-2-23).

- "We introduce the Parallel Aggregated Trees (PAT) algorithm, based on Brucks, for AllGather and ReduceScatter, achieving logarithmic scaling."
- "This algorithm is executing a binomial tree shifted for each rank."
- "it works on any number of ranks and does not require a power of two."
- "Initially, PAT only supports one GPU per node."
- "The case of one GPU per node ReduceScatter and AllGather is important for large language model (LLM) training, where pipeline parallelism and tensor parallelism are in dimensions orthogonal to data parallelism."
- **Not sourced:** the exact steps. The app shows the steps of the Bruck algorithm and marks them `assumed`.

## 7. AlltoAll and PXN

- [The NCCL point-to-point guide](https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/usage/p2p.html): "An all-to-all operation would be a merged loop of send/recv operations to/from all peers".
- [The NCCL 2.12 PXN blog](https://developer.nvidia.com/blog/doubling-all2all-performance-with-nvidia-collective-communication-library-2-12/):
  "PXN leverages NVIDIA NVSwitch connectivity between GPUs within the node to first move data on a GPU on the same rail as the destination, then send it to the destination without crossing rails."
  and "The messages exchanged between the GPUs are distinct and can't be optimized using algorithms such as tree/ring".
- **Not sourced:** the order of the sends. The app sends to rank r + s at step s and marks the order `assumed`.

## 8. Broadcast

Source: [Demystifying NCCL](https://arxiv.org/html/2507.04786).

- "Although it uses a ring topology, the communication pattern effectively forms a directed chain, beginning at the root and progressing sequentially through each GPU until the last one receives the data."
- "Each subsequent GPU in the middle of the chain executes a recvCopySend primitive".

## 9. Ring channels

- The paper: "each channel can independently exit the node through a different NIC."
- **Not sourced:** the ring order of each channel (NCCL `src/graph/search.cc` builds it). The channel picker of 11b marks its orders `assumed`.

## 10. Megatron-LM: the order of the parallel groups

Source: [`megatron/core/parallel_state.py`, line 641](https://github.com/NVIDIA/Megatron-LM/blob/86edf3d3cfe9553ce3e7b75d8f3e30558d10f2a8/megatron/core/parallel_state.py#L641).

- `order: str = "tp-cp-ep-dp-pp",`
- The `RankGenerator` docstring: "global_rank = tp_rank + dp_rank * tp_size + pp_rank * tp_size * dp_size" for the order tp-dp-pp: the first group in the order varies fastest.
- The docstring near line 773 still says "default=tp-dp-pp"; the signature is the authority.

## 11. The collective of each parallelism

Source: [The Ultra-Scale Playbook](https://huggingface.co/spaces/nanotron/ultrascale-playbook).

| Parallelism | Collective | Quote |
|-------------|------------|-------|
| Data | AllReduce | "we'll average the gradients from the model instances using an operation called 'all-reduce.'" |
| Data, ZeRO-1 | ReduceScatter and AllGather | "ZeRO-1 changes our all-reduce gradient communication to a reduce-scatter operation and adds an all-gather operation over all parameters after the optimizer step." |
| Data, ZeRO-3 | AllGather | "we all-gather the weights for Layer n+1 while we do the forward pass for Layer n" |
| Tensor | AllReduce | "f* is an all-reduce to synchronize activations … f is an all-reduce to synchronize gradients." |
| Tensor and sequence | AllGather and ReduceScatter | "g operation (all-gather) combines Y1 and Y2 back to full sequence length" and "g* operation (reduce-scatter)" |
| Pipeline | Send and receive | "we're now passing activation tensors sequentially between GPUs in a 'pipeline.'" |
| Expert | AlltoAll | "The key communication operations in EP are the 'all-to-all' operations routing tokens to their assigned experts and gathering the results back." |
| Context | Ring send and receive, or AllGather | "GPUs exchange K/V pairs in a ring-like pattern"; "performing a general all-gather, regrouping all the keys and values on each GPU" |
