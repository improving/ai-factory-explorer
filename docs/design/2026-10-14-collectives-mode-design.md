# AI Factory Explorer, Collectives mode: design

**Use:** the design of a fourth mode in the AI Factory Explorer, "Collectives".
It shows how NCCL collectives move data between GPUs, on a logical ring and on the real paths of the preset.
**For:** the SREs who run `nccl-tests` and SimCCL.
They must understand the patterns before they read a bus bandwidth number.
**This document:** the full direction (milestones 10 to 12) and the detailed design of milestone 10.
Milestones 11 and 12 get their own design when milestone 10 is merged.

## 1. Goal and constraints

Goal:

1. An SRE sees what a collective does to the data: which rank sends which chunk to which rank, at each step.
2. An SRE sees which hardware carries each step: NVLink and NVSwitch in the node, the NIC, the rail, and the leaf between nodes.
3. An SRE can calculate the expected bus bandwidth (busbw) from the topology, and compare a measured `nccl-tests` number with it.
   This is the acceptance threshold of the M4 lab, step 5.

What the training already has:

- `modules/m04-collectives-nccl/README.md` names the collectives, the ring, tree, and NVLS algorithms, and algbw against busbw. It has no picture of them.
- `modules/m11-workloads/README.md` teaches data, tensor, pipeline, expert, and context parallelism.
- `handson/SimAI_SimCCL_55_B300_Reference_Architecture_Labs.md` uses three layers (the collective, the communication pattern, the fabric).
  Labs 05 to 07 sweep AllReduce, AllGather, and ReduceScatter on one 8-GPU node.
  SimCCL gives the number; the Explorer shows why.

Constraints:

- Each number is a `Fact` with a status (`src/catalog/fact.ts`).
  `npm test` fails on a fact with no source.
  NCCL selects its algorithm, its channels, and its chunk size with its tuner.
  The app shows a model of the algorithm, and marks these choices `assumed`.
  The real choice is in the `NCCL_DEBUG=INFO` output.
- The build stays one offline file (`dist/index.html`).
- The URL keeps the state.
- With reduced motion (a system setting), nothing moves; the lit links stay.
- No name of the customer, no location, and no total GPU count of the site go into the repository, a commit message, or a pull request.
- All Markdown is ASD-STE100 and uses semantic line breaks.

## 2. The milestones

| Milestone | Scope |
|-----------|-------|
| 10 | This design: ring AllReduce, AllGather, and ReduceScatter on 1 node and on 2 nodes; the logical ring, the real paths, the buffer strip, and the busbw panel |
| 11 | Tree, NVLS, PAT, AlltoAll, and Broadcast; a channel picker; nodes in different SUs (a spine hop); the reader of `nccl-tests` output |
| 12 | The parallelism mapper: TP, PP, DP, EP, and CP groups on the GPUs of the preset; each group with its collective, and NVLink or fabric; the link to Simulate |

The algorithm list of milestone 11 follows the SimCCL matrix (the SimCCL lab manual, section 8):
AllReduce (Ring, NVLS), AllGather and ReduceScatter (Ring, PAT), AlltoAll and Broadcast (Ring).
Tree and CollNet are in NCCL, but SimCCL does not model them; the app marks them as such.

## 3. Milestone 10: the architecture and the data

### 3.1 The new folder `src/collectives/`

It contains pure functions only, with no React and no store.

```ts
type Collective = 'allreduce' | 'allgather' | 'reducescatter'
type Algorithm = 'ring' // milestone 11 adds 'tree' | 'nvls' | 'pat'
type Send = { from: number; to: number; chunk: number; op: 'copy' | 'reduce' }
type Step = { phase: 'reduce-scatter' | 'all-gather'; sends: Send[] }
type Schedule = { collective: Collective; algorithm: Algorithm; ranks: string[]; steps: Step[] }

schedule(collective, algorithm, ranks): Schedule // ranks: the GPU ids, in ring order
buffersAt(schedule, step): Contrib[][] // [rank][chunk]: the set of ranks summed into that cell
ringOrder(config, nodes): string[] // nodes: 1 | 2
ringPaths(config, ranks, failures): TraceResult[] // one traceGpus() call for each ring edge
busbw(collective, n, sizeBytes, paths): BusBw // see section 5
```

- **The step counts:** a ring AllReduce has `n-1` reduce-scatter steps, then `n-1` all-gather steps.
  A ring AllGather or ReduceScatter has `n-1` steps.
- **The chunks:** the buffer has `n` chunks.
  In each step, each rank sends one chunk to the next rank in the ring.
- **`buffersAt(schedule, 0)`** is the start state: for AllReduce and ReduceScatter, each rank has only its own contribution in each chunk;
  for AllGather, rank *r* has only chunk *r*.

### 3.2 The ring order

- **1 node:** GPU 0, 1, …, 7, then back to GPU 0.
- **2 nodes:** GPU 0 to 7 on node A, then rail 7 to GPU 7 on node B, GPU 7 to 0 on node B, then rail 0 back to GPU 0 on node A.
  Each crossing between the nodes uses the same rail at both ends, so one leaf joins them.
- **The nodes:** by default, the first two servers of SU 1.
- **The channels:** NCCL builds a number of rings (channels), each crossing on a different rail, so that all NICs carry data.
  Milestone 10 shows channel 0.
  A note in the inspector says this.
- The ring order is `assumed`, with the closest source (section 6).

### 3.3 The paths and the failures

- `ringPaths()` calls the existing `traceGpus()` (`src/routing/trace.ts`) for each ring edge, with the current failures.
  The routing rules (one leaf on a rail, PXN, NVSwitch) stay in one place.
- A degraded cable keeps its sourced bandwidth (`traceGpus()` marks the hop `degraded`).
  The busbw panel names the degraded ring edges and says that the measured busbw will be lower.
  This shows the straggler effect: one slow link slows the full collective.
- If a ring edge has no path, the panel says "no ring" and gives the reason from `traceGpus()`.

### 3.4 The state and the URL

- `Mode` (`src/state/transitions.ts`) gets `'collectives'`.
- `AppState` gets `coll: { collective: Collective; algorithm: Algorithm; nodes: 1 | 2; step: number; size: SizeId; edge: number | null } | null`.
  `size` is one of the six sizes of the panel (`1m` to `16g`).
  `edge` is the ring edge of the hop table; it is not in the URL.
- The view level does not change: Collectives mode draws over the current view, and leaving the mode shows that view again.
- The URL keeps it, for example `#…&coll=allreduce.ring.2.5.1g`.
  An incorrect value in the URL gives the default (AllReduce, ring, 1 node, step 0, 1 GiB).
- Play reuses `usePlay` and `PLAY_MS` (`src/state/play.ts`).
  The Trace bar and the Collectives bar share it: each bar stops Play only in its own mode, and a mode change stops Play.
  A URL opens the player on its step and does not play it.
- The measured busbw (section 5) is a state of the page only; it does not go into the URL.

## 4. Milestone 10: the screen and the flow

### 4.1 The mode switch

Explore · Trace · Simulate · **Collectives**.

### 4.2 The Collectives bar

It has the same place and style as the Trace bar.

- The collective: AllReduce, AllGather, ReduceScatter.
- The algorithm: "Ring", as a label. It becomes a list in milestone 11.
- The scope: 1 node, 2 nodes.
- Back, Play or Pause, Next, and the speed (Fast, Normal, Slow).
  The arrow keys also step.
  Pause, Back, Next, or an arrow key stops Play.
- The step counter, for example "Step 5 of 14 · reduce-scatter".

### 4.3 The main area

It has two parts, one above the other.

1. **The logical ring (inline SVG), at the top.**
   One circle for each rank (8 or 16), in ring order, with its rank number; its tooltip gives the GPU name.
   The ranks are in two rows: the top row from left to right, the bottom row from right to left.
   The arrows of the current step have the colour of the chunk that they carry.
   A reduce arrow has a "+" mark; a copy arrow has none.
2. **The real paths (Cytoscape), at the bottom.**
   The view shows the paths of all ring edges together, made by `src/views/collView.ts` from the paths of the tracer.
   For 1 node: GPU, NVSwitch, GPU.
   For 2 nodes: also the NIC, the rail, and the leaf.
   In a ring, all edges carry data in each step.
   At each step, all ring edges light, each in the colour of the chunk that it carries, and their dashes move.
   There is no single packet.

The chunk colours must be readable in the light and the dark theme.

### 4.4 The buffer strip (the bottom panel)

- One row for each rank, one column for each chunk.
- The colour of a cell is the colour of its chunk.
  The fill of the cell shows how many ranks it contains, and the cell shows the count, for example "3/8".
- A cell that changes in the current step gets an outline.
- At the end of an AllReduce, all cells are full: each rank has the full sum.
  The strip shows that AllReduce is a ReduceScatter followed by an AllGather.

### 4.5 The inspector

- One sentence about the current step, for example "Each rank sends one chunk to the next rank. The next rank adds it to its own copy."
- The note about the channels (section 3.2).
- The busbw panel (section 5).
- The Learn links: M4, SimCCL labs 05 to 07, nccl-tests PERFORMANCE.md, and RB-02.

### 4.6 Clicks

- A click on a rank (in the logical ring or the real paths) selects its GPU in the inspector.
- A click on a ring edge on the canvas replaces the buffer strip with the hop table of that edge, the same table as in Trace mode.
  "Show the buffers" or `Esc` brings the strip back.

## 5. Milestone 10: the busbw panel

| Line | Value | Status |
|------|-------|--------|
| The message size `S` | You select it: 1 MiB to 16 GiB; default 1 GiB | input |
| The ranks `n` | 8 or 16, from the scope | derived |
| The bus factor | AllReduce `2(n-1)/n`; AllGather and ReduceScatter `(n-1)/n` | confirmed: nccl-tests PERFORMANCE.md |
| The bottleneck `B` | The lowest hop bandwidth on all ring edges, for one direction | derived from the platform facts |
| The ideal time | `t = S × factor / B` | derived |
| The expected busbw (upper limit) | `B` | derived |
| The measured busbw | You type the number from `nccl-tests`; the panel shows it as a percentage of `B` | input |

- The panel says the lesson of nccl-tests: busbw is calculated so that you can compare it directly with the speed of the slowest link.
  That is why 1 node gives an NVLink number and 2 nodes give a number from the NICs: on 2 nodes, NCCL runs 8 rings (channels), one through each NIC, so the limit is 8 × the NIC speed, unless NVLink is lower.
- **The units:** the hop bandwidth facts do not use one unit.
  For example, `nvlinkPerGpu` is 1.8 TB/s for B300, for the two directions together, and the NIC speed is in Gb/s.
  `busbw()` converts each value to GB/s for one direction.
  The sourcing note gives the direction of each fact.
- **The latency:** at small sizes, the latency controls the time, so the measured busbw is lower.
  Milestone 10 does not model the latency.
  A note marks this `assumed`.
- The app gives no efficiency factor (the part of `B` that a real run gets): no source gives one for these platforms.

## 6. Milestone 10: the sources

A new sourcing note, `docs/superpowers/specs/2026-10-14-ai-factory-explorer-m10-sourcing.md`, records:

- [nccl-tests PERFORMANCE.md](https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md): algbw, busbw, and the bus factor of each collective.
- [Demystifying NCCL](https://arxiv.org/abs/2507.04786): the ring steps, the chunks, and the channels.
- The NCCL user guide: `NCCL_ALGO` and the channels.
- The SimCCL lab manual, section 8: the algorithms that SimCCL models.
- The platform facts that the app already has: the NVLink bandwidth and the NIC speed, with the direction of each.
- The values with no source (the ring order between nodes, channel 0 only, no latency model), each with its note.

## 7. Milestone 10: the tests

Unit tests (Vitest):

- The step counts: AllReduce `2(n-1)`; AllGather and ReduceScatter `n-1`; for `n` = 8 and 16.
- In each step, each rank sends one chunk and receives one chunk.
- The end state:
  AllReduce gives the full sum in each cell;
  AllGather gives all chunks on each rank;
  ReduceScatter gives rank *r* the chunk *r*, fully reduced.
- The ring order for 1 node and for 2 nodes.
  Each crossing between the two nodes goes through one leaf on the same rail.
- The busbw: the bus factors, the unit conversion, the bottleneck (NVLink for 1 node, the NIC for 2 nodes), and a degraded cable that is named, with the limit unchanged.
- The URL: the encode and the decode give the same state; an incorrect value gives the default.
- The existing fact and citation tests pass with the new facts.

Smoke test (Playwright, `e2e/`):

- Open Collectives, select AllReduce on 2 nodes, step to the end.
  Check that each cell of the buffer strip is full and that the busbw panel names the NIC as the bottleneck.

## 8. Out of scope for milestone 10

- Tree, NVLS, PAT, AlltoAll, Broadcast, and a channel picker (milestone 11).
- Nodes in different SUs, with a spine hop (milestone 11).
- The reader of `nccl-tests` output (milestone 11).
- The parallelism mapper and the link to Simulate impact (milestone 12).
- NVL72 designs: the scope "1 node" uses an 8-GPU HGX server.
  On an NVL72 preset, the Collectives mode says that the rack scope comes in milestone 11.
  The canvas keeps the current view.

## 9. Delivery

- The branch `collectives-mode-design` holds this design.
- After the review, the implementation plan goes into `docs/superpowers/plans/`, and milestone 10 is one pull request.
- The `README.md` gets a "Collectives mode" section, as for the other modes.
