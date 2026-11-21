# AI Factory Explorer, Collectives mode, milestones 11 and 12: design

**Use:** the design of the next three stacked pull requests after milestone 10 (#33): 11a, 11b, and 12.
**Before:** [the Collectives mode design](2026-10-14-collectives-mode-design.md) (milestone 10).
**Sources:** [the sourcing note of milestones 11 and 12](2026-10-14-ai-factory-explorer-m11-sourcing.md).

## 1. Goal and constraints

Goal:

1. **11a:** the SRE sees each algorithm that NCCL can select (Ring, Tree, NVLS, PAT, and the send/receive of AlltoAll), and the collectives AlltoAll and Broadcast.
   The SRE sees why one algorithm gives another busbw on the same hardware.
2. **11b:** the SRE pastes the output of `nccl-tests` and gets the busbw of each size against the limit of the model, with the failures marked.
   The ring can use other channels, nodes in different SUs, and the trays of an NVL72 rack.
3. **12:** the SRE sets a parallelism plan (TP, CP, EP, DP, PP) for a job, and sees which GPUs talk together, with which collective, and on which network.

Constraints (the same as milestone 10):

- Each number is a `Fact` with a status; a value with no quote in the sourcing note is `assumed`, with a note shown as text.
- The build stays one offline file; the URL keeps the state; an incorrect URL value gives the default.
- With reduced motion, nothing moves.
- No name of the customer, no location, and no total GPU count of the site.
- All Markdown is ASD-STE100 and uses semantic line breaks.
- A buffer can have 16 ranks at most (the bit masks of milestone 10).

## 2. The pull requests

| PR | Branch | Base | Scope |
|----|--------|------|-------|
| 11a | `explorer-m11a-algorithms` | `collectives-mode-design` (#33) | The link-load model; Tree, NVLS, PAT, AlltoAll, Broadcast; the scope "N nodes, 1 GPU each" |
| 11b | `explorer-m11b-reader` | 11a | The `nccl-tests` reader; the channel picker; 2 nodes in different SUs; NVL72 trays |
| 12 | `explorer-m12-parallelism` | 11b | The parallelism mapper; "Play this group"; the failed GPUs of Simulate mode |

Each PR has its own plan in `docs/superpowers/plans/` and its own final review.
When #33 merges, the base of 11a becomes `main` (and so on up the stack).

## 3. 11a: the link-load model

Milestone 10 took the slowest hop of the ring as the limit.
That rule is correct for a ring only.
11a replaces it with one model for all algorithms.

- **The schedule** (the sends of each step) gets two new fields:
  `chunks` (the number of columns of the buffer, `n` for most algorithms) and, on a send, `toChunk` (the slot that the receiver writes; the default is `chunk`).
  A send can also say `via: 'reduce' | 'multicast'` (NVLS, section 4.3).
- **The paths:** each pair of ranks that a schedule uses gets its path from `traceGpus()`, once (a cache by pair).
- **The load of a link:** the sum, over all steps and all sends, of the bytes of each send on each hop of its path.
  A link is a directed hop (`from > to`).
  A chunk has `S / chunks` bytes, where `S` is the size of the `nccl-tests` column (section 1 of the sourcing note).
- **The time:** `t = max over the links (load ÷ bandwidth)`.
  A hop with no sourced bandwidth (PCIe) is left out, as in milestone 10.
- **The busbw limit:** `S / t × the bus factor` of the collective.
  The busiest link is the bottleneck.
- **Why it is correct for a ring:** each link of the ring carries `2(n-1)` chunks of `S/n`, so `t = 2(n-1)S / (nB)` and the limit is `B`, as in milestone 10.
- **What it leaves out** (`assumed`, with a note): the latency of each step, the pipeline fill, and the protocol (LL, LL128, Simple).
  The limit is a bandwidth limit; at small sizes, the measured busbw is lower.

The milestone 10 tests of the busbw stay and pass with the new model (the same numbers).

## 4. 11a: the algorithms

### 4.1 The algorithm of each collective and scope

| Collective | 1 node (8) | 2 nodes (16) | N nodes, 1 GPU each (4, 8, 16) |
|------------|-----------|--------------|--------------------------------|
| AllReduce | Ring, NVLS | Ring | Ring, Tree |
| AllGather | Ring | Ring | Ring, PAT |
| ReduceScatter | Ring | Ring | Ring, PAT |
| AlltoAll | Send/receive | Send/receive | Send/receive |
| Broadcast | Ring | Ring | Ring |

- The table follows the sources: NVLS is for "intra-node allreduce"; PAT "only supports one GPU per node"; Tree branches "only across nodes".
- A change of collective or scope that makes the algorithm invalid selects the first valid one.
- **The new scope "N nodes, 1 GPU each":** GPU 0 of the first N servers of SU 1 (all on rail 0, under one leaf).
  This is the data-parallel case of the PAT quote: "pipeline parallelism and tensor parallelism are in dimensions orthogonal to data parallelism."

### 4.2 Tree (AllReduce, N nodes)

- Two binary trees over the N ranks; each tree carries half of the data (chunk 0 on tree 1, chunk 1 on tree 2; `chunks` = 2).
- Tree 1: a binary tree in which the odd ranks are the leaves.
  Tree 2: the mirror of tree 1 (rank `r` becomes `N-1-r`) when N is even, as the paper says.
  A test checks the property of the blog: "no rank is a node on both trees".
  The shape of tree 1 is `assumed` (NCCL builds it in `src/graph/trees.cc`).
- The steps: a Reduce phase up both trees at the same time (one level of the tree in each step), then a Broadcast phase down.
  NCCL pipelines the two phases; the app shows them one after the other, and a note says so.

### 4.3 NVLS (AllReduce, 1 node)

- Two steps:
  1. **Reduce in the switch:** each rank `r` gets chunk `r`, added from all ranks by the NVSwitch chips.
  2. **Multicast:** each rank `r` sends chunk `r` once; the switch copies it to all ranks.
- In the link-load model, a reduce send loads the switch-to-receiver hop once for each chunk, and a multicast send loads the sender-to-switch hop once.
  So each GPU sends `S` and receives `S`, and the limit is `2(n-1)/n × B`: 1575 GB/s on one B300 node, above the NVLink speed.
- This is the lesson: with NVLS, the switch does the addition, so the busbw of `nccl-tests` can be higher than the link.
  The figure is `assumed`: no NVIDIA page gives it (sourcing note, section 5).

### 4.4 PAT (AllGather and ReduceScatter, N nodes)

- The app shows the steps of the Bruck algorithm: `ceil(log2 N)` steps; at step `k`, each rank sends the chunks that it has (up to `2^k`) to rank `r - 2^k`.
  ReduceScatter runs the same steps in reverse, with addition.
- The source says PAT is "based on Brucks" and "a binomial tree shifted for each rank"; the exact steps are `assumed`.
- The lesson: `log2 N` steps against `N-1` for the ring, with the same bytes on each link.

### 4.5 AlltoAll (all scopes)

- `n-1` steps; at step `s`, rank `r` sends its chunk for rank `r+s` to that rank, which writes it in slot `r`.
- At the end, rank `r` has, in slot `c`, the chunk that rank `c` had for it (the buffer strip shows the transpose).
- On 2 nodes, the paths come from the tracer with PXN on, so the data crosses on the rail of the destination.
- The order of the sends is `assumed` (NCCL groups all sends in one call).

### 4.6 Broadcast (all scopes)

- Root: rank 0.
  A chain from the root, in ring order; 8 chunks (`chunks` = 8), pipelined: `(n-1) + 7` steps.
- At step `s`, rank `r` sends chunk `s - r` to rank `r+1`, when that chunk exists.

## 5. 11a: the screen

- **The bar:** the collective list gets AlltoAll and Broadcast; the algorithm becomes a list (only the valid algorithms); the scope list gets "4 nodes, 1 GPU each", "8 nodes, 1 GPU each", and "16 nodes, 1 GPU each".
- **The logical diagram** has one layout for each family:
  - Ring and Broadcast: the two rows of milestone 10.
  - Tree, PAT, and AlltoAll: the ranks in one row, with the arrows as arcs; tree 1 above the row and tree 2 below it.
  - NVLS: the two rows, with a box for the NVSwitch chips in the middle; the arrows go to the box (reduce) and from it (multicast).
  - When a rank sends more than one chunk to the same rank in one step, one arrow shows "×k".
- **The real paths:** one edge for each link that the schedule uses (not one for each send).
  In a step, a link is lit in the colour of its chunk; a link with more than one chunk is lit in the select colour, with the count.
  A click on a link opens the hop table of the first pair of the step that uses it.
- **The buffer strip** has `chunks` columns.
  For AlltoAll and Broadcast, a cell shows the rank whose data it holds, not a count.
- **The busbw panel:** "Bottleneck" names the busiest link and its load; the notes add the model note (section 3) and the note of the algorithm.

## 6. 11b: the reader, the channels, the SUs, and NVL72

### 6.1 The `nccl-tests` reader

- A button "Read nccl-tests output" in the bar opens a panel in the bottom area (in place of the buffer strip).
  The user pastes the output; nothing leaves the page.
- `parseNcclTests(text)` (pure, with tests) reads:
  the test name (`# Collective test starting:` when present, else the user selects the collective);
  the rank lines (the number of ranks, and the hosts, from `on <host> device <n>`);
  each row (size, count, type, redop, root, then time, algbw, busbw, #wrong for out-of-place and in-place);
  `# Out of bounds values` and `# Avg bus bandwidth`.
  Optional columns (`i_min …`, `impl algo …`) give a clear message.
- The panel shows:
  a chart of busbw against size (a log scale for size), out-of-place and in-place, with a line at the limit of the model for the collective, the number of ranks, and the platform (when a scope of the app has that number of ranks; else the user types the limit);
  a table of the rows;
  marks: a row with `#wrong > 0` or `FAILED` (data errors: stop, RB-03), the largest size below the threshold (a percentage of the limit; default 80 %, `assumed`, and the user can change it), and a link to RB-02 for a slow result.

### 6.2 The channel picker (2 nodes)

- Channels 0 to 7.
  Channel `c` rotates the ring so that it crosses between the nodes on rails `c` and `c+7 (mod 8)`.
  The orders are `assumed` (sourcing note, section 9).
- "All channels" shows the 8 rings together on the canvas: each NIC carries one crossing in each direction.

### 6.3 Two nodes in different SUs

- The scope "2 nodes, different SUs" (when the configuration has a second group of SUs): the first server of SU 1 and the first server of the first SU of the next group.
  The crossings go through a spine, and the panel shows the spine links.

### 6.4 NVL72 trays

- On an NVL72 platform, the scopes are: "1 tray (4 GPUs)", "4 trays (16 GPUs)", and "N trays, 1 GPU each" (4, 8, 16).
  All paths are NVLink through the switch trays (the tracer, `nvl72-rack`).
- The Collectives mode of milestone 10 said "no ring" on NVL72; that message goes.

## 7. 12: the parallelism mapper

### 7.1 The input

- A "Parallelism" view in Collectives mode (a switch in the bar: "Collective | Parallelism").
- The job: N servers of the preset (1, 2, 4, 8, 16, or 32; or trays on NVL72), so `G` GPUs.
- The sizes TP, CP, DP, PP, with `TP × CP × DP × PP = G` (the panel refuses another product and says why).
  EP divides `DP × CP`; the expert groups are cut from those ranks.
- The order of the ranks is the Megatron-LM default, `tp-cp-ep-dp-pp`: TP varies fastest.
  The EP rule is a simplification of Megatron-LM and is `assumed`.

### 7.2 The view

- A grid: one row for each server, one cell for each GPU.
  A dimension list (TP, CP, EP, DP, PP) selects which groups have a colour; a click on a cell selects its group of that dimension.
- A table, one row for each dimension:
  the number of groups, the group size, the collective (section 11 of the sourcing note),
  and the network of a group: "NVLink (one server)", "NVLink (one rack)" on NVL72, "one leaf (same rail)", or "spine", from `traceGpus()` between the members.
- The lesson in one line under the table: TP stays in the NVLink domain; DP and PP cross the fabric.

### 7.3 The links to the other views

- **"Play this group":** opens Collective view with the ranks of the selected group and its collective (for example a TP group of 8: Ring AllReduce on 1 node; an EP group: AlltoAll).
  `CollState` gets the scope `group` with the list of GPUs; a group of more than 16 GPUs shows the first 16 and says so.
- **The failures of Simulate mode:** a failed GPU has a mark in the grid, and the table says which groups include it.
  A note says: "a collective waits for each member; one lost GPU stops its groups, and so the full job."

## 8. Tests

- **11a:**
  the link-load model gives the milestone 10 values for Ring;
  NVLS gives `2(n-1)/n × B` on 1 node;
  Tree: the two trees have no common inner rank, and AllReduce ends with the full sum in both chunks;
  PAT: `ceil(log2 N)` steps, and AllGather and ReduceScatter end in the same state as the ring;
  AlltoAll: the end state is the transpose;
  Broadcast: each rank ends with all 8 chunks of rank 0;
  the valid algorithms of each collective and scope;
  the URL of each new value, and old milestone 10 links (`.1.` and `.2.` scopes) still open;
  smoke tests: NVLS on 1 node shows a limit above 900 GB/s; Tree on 8 nodes plays to the end.
- **11b:** the parser (a full output, an output with no test name, optional columns, `#wrong > 0`, `FAILED`); the channel orders; the SU scope goes through a spine; NVL72 scopes; smoke: paste a sample and see the chart and the marks.
- **12:** the rank groups for `tp-cp-ep-dp-pp` (for example TP 8 × DP 4 on 4 nodes: each TP group is one server, each DP group is one rail); the product rule; the networks; "Play this group" opens the right state; smoke: a 4-node plan.

## 9. Out of scope

- CollNet and IB SHARP (no switch in the presets models SHARP).
- NVLSTree, and NVLS for AllGather and ReduceScatter.
- A latency model, the protocols, and the chunk size of NCCL.
- More than 16 ranks in one buffer.
- Reading `NCCL_DEBUG=INFO` output (a later milestone can parse the rings and the transport from it).
