# SimAI + SimCCL — Hands-On Labs Focused on the NVIDIA B300 Reference Architecture

55 core labs (01-55) plus 9 NCCL environment-variable labs (56-64).

## How to use this lab manual

**Who this is for.** Someone who administers or operates GPU clusters
(an SRE, platform engineer, or systems engineer) and wants to understand
how collective communication behaves on the NVIDIA DGX B300 XDR
reference architecture — *before* touching real hardware. No prior NCCL,
SimAI, or networking background is assumed beyond basic Linux
command-line use.

**You do not need any GPUs.** Everything here runs on a normal Linux
machine or VM. SimAI/SimCCL are CPU-only simulators: they predict *what
NCCL would decide* and *what network flows would result*; they do not
execute real GPU work.

**Terms you don't know?** There is a [Glossary](#appendix-b--glossary)
at the end — check it the first time a word like "rail", "fat tree", or
"NVLS" appears.

**Three labels keep experiments honest.** Every experiment falls into
one of three categories (full rules in §18):

- `REFERENCE` — matches the NVIDIA B300 reference architecture exactly.
- `ABSTRACTION` — SimAI cannot model the real hardware detail, so you use
  a documented simplification.
- `COUNTERFACTUAL` — you deliberately deviate from the B300 spec to
  learn "what if".

**Suggested path.** If you are new, do Labs 01-15 in order, then jump to
the three key experiments in §19 (Experiments A, B, C). The topology,
plane, rail, and blocking labs (21-45) can be done in any order after
that. Labs 56-64 cover NCCL environment variables and can be done
independently.

------------------------------------------------------------------------

## Prerequisites and environment checklist

| Requirement | Minimum | Check |
|---|---|---|
| OS | Ubuntu 22.04, or macOS (Sonoma+) | `cat /etc/os-release` / `sw_vers` |
| RAM | 16 GB | `free -h` |
| CPU | 8 cores | `nproc` |
| Disk | 50 GB free | `df -h .` |
| Tools | git, gcc, g++, cmake, python3 | §5 install step |
| GPUs | **none needed** | — |

> **Docker/NGC alternative:** the SimAI maintainers recommend running
> inside a recent NVIDIA NGC PyTorch container if you have Docker. If you
> use an NGC image, remove `ninja` first
> (`apt remove ninja-build && pip uninstall ninja`) or the ns-3 build
> fails.

------------------------------------------------------------------------

## The canonical SimCCL command

Almost every lab runs the same binary with different flags. Learn this
once and each lab only shows you what to change:

``` bash
cd SimAI/SimCCL/src          # binary lives inside a SimAI checkout
./build/simccl-standalone \
  --op AllReduce \           # collective: AllReduce|AllGather|ReduceScatter|AlltoAll|Broadcast
  --size 4194304 \           # message size in bytes (here 4 MiB)
  --nRanks 8 \               # total ranks (GPUs) participating
  --nNodes 1 \               # number of DGX nodes
  --gpus_per_node 8 \        # GPUs per node (8 = one DGX B300)
  --gpu_type H20             # tuning profile name — NOT a B300 perf model
```

Output is written to `ncclFlowModel_detailed_flows.csv` in the working
directory — one row per simulated point-to-point flow. Inspect it with:

``` bash
head -20 ncclFlowModel_detailed_flows.csv
column -s, -t ncclFlowModel_detailed_flows.csv | less -S
```

When a lab says "run AllReduce at N GPUs", expand:

``` text
nRanks = N          nNodes = N / 8         gpus_per_node = 8
```

> **Important:** SimCCL must be built *inside* a full SimAI checkout
> (`SimAI/SimCCL/` next to `SimAI/astra-sim-alibabacloud/`) — see §8.

------------------------------------------------------------------------

> **Scope correction / terminology note**
>
> NVIDIA's current official documentation identifies the relevant
> architecture as **DGX B300 / DGX SuperPOD with DGX B300 systems**. I
> could not find an NVIDIA reference architecture officially named
> **"B300 NVL2."** NVIDIA separately documents GB300 NVL72 and other NVL
> products.
>
> Therefore, this lab manual is intentionally locked to the **DGX B300
> XDR InfiniBand Reference Architecture** and its B300 scale-out fabric.
> If by "B300 NVL2" you mean a specific NVIDIA document that uses that
> exact name, send me that link and I can remap the labs precisely to
> it.
>
> The official B300 XDR RA specifies an 8-GPU DGX B300 compute node,
> fifth-generation NVLink, Quantum-X800 800-Gbps InfiniBand compute
> fabric, and a rail-optimized, non-blocking, twin-plane fat-tree
> compute fabric. A scalable unit (SU) contains 72 DGX B300 systems /
> 576 GPUs in this RA.

------------------------------------------------------------------------

# 1. What these labs are trying to teach

The goal is **not** to learn SimAI generically.

The goal is to use SimAI + SimCCL as a laboratory for answering
questions about the **B300 reference architecture**:

``` text
                  DGX B300
              8 × Blackwell Ultra
                       |
                 NVLink / NVSwitch
                       |
                 network rails
                       |
                 800G XDR IB
                       |
                 Leaf switches
                       |
                 Spine switches
                       |
                 800G XDR IB
                       |
                  Other DGX
```

The B300 XDR reference architecture specifies:

-   8 Blackwell Ultra GPUs per DGX B300 system
-   Fifth-generation NVIDIA NVLink
-   Fourth-generation NVSwitch
-   800-Gbps XDR InfiniBand compute fabric
-   Rail-optimized fabric
-   Non-blocking fabric
-   Twin-plane fabric
-   Fat-tree topology
-   72 DGX B300 systems per scalable unit
-   576 GPUs per SU
-   8 leaves and 4 spines for the 1-SU example
-   576 node-to-leaf connections
-   576 leaf-to-spine connections

These values are taken from the NVIDIA reference architecture and should
be treated as the **baseline model** for the labs rather than replaced
by generic H100/Spectrum-X examples.

------------------------------------------------------------------------

# 2. What will be simulated

There are three layers.

## Layer 1 — NCCL collective

Examples:

``` text
AllReduce
AllGather
ReduceScatter
AlltoAll
Broadcast
```

Question:

> What communication does the application require?

------------------------------------------------------------------------

## Layer 2 — NCCL/SimCCL communication pattern

Examples:

``` text
Ring
Tree
NVLS
PXN
channels
chunks
point-to-point flows
```

Question:

> Which GPU/rank communicates with which other GPU/rank?

SimCCL can independently analyze collective communication and generate a
detailed flow model. Current SimAI 1.7 decouples SimCCL from the main
repository and updates it to NCCL v2.30.

------------------------------------------------------------------------

## Layer 3 — B300 network fabric

``` text
GPU
 |
NVLink/NVSwitch
 |
network rail
 |
DGX network interface
 |
Leaf
 |
Spine
 |
Leaf
 |
DGX network interface
 |
NVLink/NVSwitch
 |
GPU
```

Question:

> What happens to those flows when they traverse the B300 fabric?

SimAI's ns-3 simulation mode is intended for detailed network
communication modeling.

------------------------------------------------------------------------

# 3. Fixed B300 baseline

Unless a lab explicitly asks you to change a parameter, use this
baseline.

  Parameter                      B300 RA baseline
  ------------------------ ----------------------
  GPU architecture                Blackwell Ultra
  GPUs / DGX B300                               8
  NVLink generation                5th generation
  NVSwitch                         4th generation
  Compute network                  InfiniBand XDR
  Network bandwidth          800 Gbps / direction
  Fabric                           Rail-optimized
  Fabric                             Non-blocking
  Fabric                               Twin-plane
  Topology                               Fat tree
  GPUs / SU                                   576
  DGX B300 / SU                                72
  Leaf / SU                                     8
  Spine / SU                                    4
  Node-leaf cables / SU                       576
  Leaf-spine cables / SU                      576

The official RA gives the 1-SU example as 72 nodes / 576 GPUs / 8 leaves
/ 4 spines / 576 node-leaf connections / 576 leaf-spine connections.

------------------------------------------------------------------------

# 4. Critical B300 architecture concept

Do **not** start by assuming:

``` text
8 GPUs = 8 network links
```

Instead separate:

``` text
8 GPUs
   |
GPU-to-GPU scale-up fabric
   |
NVLink/NVSwitch
   |
network-facing rails/interfaces
   |
800G XDR IB
   |
scale-out fabric
```

The B300 RA describes the DGX B300 as an 8-GPU system and the compute
fabric separately as the 800-Gbps XDR InfiniBand fabric.

Your labs should therefore model **scale-up and scale-out separately**
before combining them.

------------------------------------------------------------------------

# 5. Install environment

Recommended:

``` text
Ubuntu 22.04
16+ GB RAM
8+ CPU cores
50+ GB disk
```

You do not need eight physical B300 GPUs for the simulation labs.

### Linux (Ubuntu/Debian)

Install:

``` bash
sudo apt update

sudo apt install -y \
  git \
  build-essential \
  cmake \
  python3 \
  python3-pip \
  python3-venv \
  wget \
  curl
```

### macOS

SimCCL and the analytical simulator build on macOS with Apple Clang;
the full ns-3 simulation mode is less tested there — if `build.sh -c
ns3` fails on your Mac, use a Linux VM, an Ubuntu Docker container, or
an NGC image for the ns-3 labs and keep the SimCCL standalone labs
(which cover most of this manual) on macOS.

Install the toolchain with [Homebrew](https://brew.sh):

``` bash
# Apple Command Line Tools (provides clang, make, git)
xcode-select --install

# then:
brew install cmake python3 wget

# verify brew's python is first in PATH if you have several pythons
echo 'export PATH="$(brew --prefix python3)/libexec/bin:$PATH"' >> ~/.zshrc
```

Notes:

- Use `clang`/`clang++` where the labs say gcc/g++ — macOS aliases `gcc`
  to Clang anyway.
- If CMake complains about a missing `make`, run
  `xcode-select --install` again or `brew install make` (installed as
  `gmake`).
- Apple Silicon (M1/M2/M3/M4) works for the SimCCL standalone labs; the
  binary is CPU-only.

### Optional: Ubuntu in Docker (works on macOS or any OS)

If you prefer a disposable Ubuntu environment — or your macOS ns-3 build
fails — run the labs in a container:

``` bash
# start a throwaway Ubuntu 22.04 container with a shell
docker run -it --name simai-labs \
  -v "$PWD/simai-work:/work" -w /work \
  ubuntu:22.04 bash

# inside the container:
apt update && apt install -y \
  git build-essential cmake python3 python3-pip python3-venv wget curl

# then continue with §6 (clone SimAI) — everything under /work persists
# on your host in ./simai-work
```

Useful follow-ups:

``` bash
exit                        # leaves the container (it keeps existing)
docker start -ai simai-labs # re-enter the same container later
docker rm -f simai-labs     # delete it entirely when done
```

> **Tip:** on Apple Silicon, Docker pulls the arm64 Ubuntu image
> automatically — no extra flags needed.

### Verify (all platforms)

``` bash
gcc --version        # on macOS this reports Apple clang — that is fine
g++ --version
cmake --version
python3 --version
git --version
```

------------------------------------------------------------------------

# 6. Clone SimAI

``` bash
git clone https://github.com/aliyun/SimAI.git
cd SimAI

git submodule update --init --recursive
git submodule update --remote
```

The current SimAI project contains:

``` text
AICB
SimCCL
astra-sim-alibabacloud
ns-3-alibabacloud
```

and supports analytical and detailed simulation modes.

------------------------------------------------------------------------

# 7. Build SimAI

Analytical:

``` bash
./scripts/build.sh -c analytical
```

Simulation:

``` bash
./scripts/build.sh -c ns3
```

Verify:

``` bash
ls -lh bin/SimAI_analytical
ls -lh bin/SimAI_simulator
```

------------------------------------------------------------------------

# 8. Build SimCCL

Current SimAI 1.7 uses SimCCL based on NCCL v2.30.

From the SimCCL source directory:

``` bash
cd SimCCL/src
bash build.sh v2.30
```

Verify:

``` bash
./build/simccl-standalone --help
```

Official SimAI documentation shows SimCCL can be used independently for
collective-flow analysis.

### Which algorithms SimCCL actually models

Per the SimCCL README, the supported collective → algorithm matrix is:

  Collective      Algorithms          Notes
  -------------   ------------------  -----------------------------------
  AllReduce       Ring, NVLS          NVLS only for single-node ≥ 8 GPUs
  AllGather       Ring, PAT           PAT only for multi-node 1-GPU/node
  ReduceScatter   Ring, PAT           PAT only for multi-node 1-GPU/node
  AlltoAll        Ring
  Broadcast       Ring

Tree algorithm constants exist in the code but are **not auto-selected**
on the tested hardware profile (H20). CollNetDirect/CollNetChain are
**not implemented** (they require SHARP switch hardware). Keep this in
mind: several labs ask whether a "tree" formed — the honest answer may
be "SimCCL did not model one". The NCCL env-var labs (56-64) explore
forcing algorithms explicitly.

------------------------------------------------------------------------

# 9. First SimCCL experiment

Run:

``` bash
./build/simccl-standalone \
  --op AllReduce \
  --size 4194304 \
  --nRanks 8 \
  --nNodes 1 \
  --gpus_per_node 8 \
  --gpu_type H20
```

For these first labs, the GPU name is only a simulator input where
supported. Do not interpret `H20` as a B300 performance model.

Later labs will use the B300 topology parameters explicitly.

Inspect:

``` bash
head -20 ncclFlowModel_detailed_flows.csv
```

------------------------------------------------------------------------

# 10. B300 simulation philosophy

The B300 RA gives us the **target architecture**.

SimAI does not contain a magic switch called:

``` text
--architecture B300-XDR
```

Therefore the correct methodology is:

``` text
B300 RA
   |
   v
Extract architectural parameters
   |
   v
Map parameters to SimAI topology model
   |
   v
Run collective
   |
   v
Measure modeled behavior
```

Where the simulator cannot directly model an NVIDIA hardware detail,
document the abstraction instead of pretending it is exact.

------------------------------------------------------------------------

# 11. 55 B300-focused labs (labs 56-64: NCCL environment variables)

------------------------------------------------------------------------

## LAB 01 — Verify the simulation environment

### Goal

Build a reproducible environment.

``` bash
uname -a
gcc --version
g++ --version
python3 --version
cmake --version
```

Record the versions.

### Deliverable

``` text
lab01-environment.txt
```

------------------------------------------------------------------------

## LAB 02 — Inspect SimAI components

Identify:

``` text
SimCCL
AICB
Astra-Sim
ns-3
```

Answer:

1.  Which component models collectives?
2.  Which component generates flows?
3.  Which component models network behavior?

------------------------------------------------------------------------

## LAB 03 — Build SimCCL

Build:

``` bash
cd SimAI/SimCCL/src
bash build.sh v2.30
```

Run:

``` bash
./build/simccl-standalone --help
```

------------------------------------------------------------------------

## LAB 04 — 8-GPU B300 logical node

Model the fundamental B300 compute unit:

``` text
DGX B300

GPU0 GPU1 GPU2 GPU3
GPU4 GPU5 GPU6 GPU7

        |
   NVLink/NVSwitch
```

Run an 8-rank AllReduce (the canonical command — one DGX B300):

``` bash
./build/simccl-standalone --op AllReduce --size 4194304 \
  --nRanks 8 --nNodes 1 --gpus_per_node 8 --gpu_type H20
```

Record (from the CSV):

``` text
algorithm
protocol
flow count          # wc -l ncclFlowModel_detailed_flows.csv
```

### Lesson

The first important unit in the B300 RA is the **8-GPU DGX B300
system**.

------------------------------------------------------------------------

## LAB 05 — B300 8-GPU AllReduce message sweep

Run:

``` text
16 MiB
32 MiB
64 MiB
128 MiB
256 MiB
512 MiB
1 GiB
```

Keep:

``` text
--nRanks 8  --nNodes 1  --gpus_per_node 8
```

Only `--size` changes between runs (bytes): 16777216, 33554432,
67108864, 134217728, 268435456, 536870912, 1073741824.

Save each run's CSV to a different name before the next run, e.g.:

``` bash
./build/simccl-standalone --op AllReduce --size 16777216 \
  --nRanks 8 --nNodes 1 --gpus_per_node 8 --gpu_type H20
mv ncclFlowModel_detailed_flows.csv lab05_16MiB.csv
```

Plot:

``` text
message size
      vs
flow count
```

------------------------------------------------------------------------

## LAB 06 — AllGather on B300 8-GPU node

Run:

``` bash
./build/simccl-standalone --op AllGather --size 4194304 \
  --nRanks 8 --nNodes 1 --gpus_per_node 8 --gpu_type H20
```

Compare the flow CSV with the AllReduce CSV from LAB 04/05.

Question:

> Which traffic is fundamentally different?

------------------------------------------------------------------------

## LAB 07 — ReduceScatter on B300 8-GPU node

Run:

``` bash
./build/simccl-standalone --op ReduceScatter --size 4194304 \
  --nRanks 8 --nNodes 1 --gpus_per_node 8 --gpu_type H20
```

Then explain:

``` text
ReduceScatter + AllGather ≈ AllReduce
```

------------------------------------------------------------------------

## LAB 08 — AlltoAll on B300 8-GPU node

Run:

``` bash
./build/simccl-standalone --op AlltoAll --size 4194304 \
  --nRanks 8 --nNodes 1 --gpus_per_node 8 --gpu_type H20
```

Generate the source/destination matrix from the CSV (every rank sends
to every other rank — you should see ~8×8 pairs).

------------------------------------------------------------------------

## LAB 09 — Collective comparison

Compare:

``` text
AllReduce
AllGather
ReduceScatter
AlltoAll
```

for identical payloads.

Deliver:

``` text
collective
flow count
source/destination pattern
expected network pressure
```

------------------------------------------------------------------------

## LAB 10 — Identify the scale-up boundary

Create:

``` text
GPU-to-GPU communication
```

versus:

``` text
GPU-to-network communication
```

For each collective determine whether a particular flow is:

``` text
intra-DGX
or
inter-DGX
```

------------------------------------------------------------------------

## LAB 11 — B300 rank-to-GPU mapping

Create a mapping:

``` text
Rank 0 -> GPU0
Rank 1 -> GPU1
...
Rank 7 -> GPU7
```

Then create a second hypothetical mapping.

Study how rank placement affects communication.

------------------------------------------------------------------------

## LAB 12 — SimCCL flow parser

Create:

``` text
parse_b300_flows.py
```

Print:

``` text
total flows
flows/source
flows/destination
source/destination pairs
```

------------------------------------------------------------------------

## LAB 13 — B300 AllReduce flow matrix

Create:

``` text
        GPU0 GPU1 GPU2 GPU3 GPU4 GPU5 GPU6 GPU7
GPU0
GPU1
GPU2
...
```

Populate the matrix from SimCCL output.

------------------------------------------------------------------------

## LAB 14 — Ring analysis

Determine whether the selected AllReduce implementation forms a
ring-like communication structure.

Draw:

``` text
GPU0 -> GPU1 -> GPU2 -> ... -> GPU7 -> GPU0
```

Compare the drawing with actual SimCCL output.

------------------------------------------------------------------------

## LAB 15 — Tree analysis (and its SimCCL limitation)

Real NCCL often selects a **tree** algorithm for AllReduce. In SimCCL,
tree constants exist but are **not auto-selected** on the tested
hardware profile — so this lab has two honest parts.

### Part 1 — Check what SimCCL selected

Run the canonical AllReduce (8 ranks, 1 node) and inspect the CSV:

``` bash
./build/simccl-standalone --op AllReduce --size 4194304 \
  --nRanks 8 --nNodes 1 --gpus_per_node 8 --gpu_type H20
grep -io 'tree\|ring\|nvls' ncclFlowModel_detailed_flows.csv | sort | uniq -c
```

### Part 2 — Try to force a tree

Attempt to force the algorithm with `NCCL_ALGO`:

``` bash
NCCL_ALGO=Tree ./build/simccl-standalone --op AllReduce --size 4194304 \
  --nRanks 8 --nNodes 1 --gpus_per_node 8 --gpu_type H20
```

Compare the resulting CSV with Part 1. If the flows are unchanged,
document that SimCCL does not honor `NCCL_ALGO` for this case — that is
a valid finding (record it as `ABSTRACTION`).

### Compare (on paper, if needed)

``` text
Ring:  GPU0 -> GPU1 -> ... -> GPU7 -> GPU0   (long chain, fan-out 1)
Tree:  parent/children fan-out               (fewer hops, fan-out > 1)
```

Discuss which would put more simultaneous load on a leaf switch in a
multi-DGX run.

------------------------------------------------------------------------

# SCALE FROM ONE B300 TO MULTIPLE B300 SYSTEMS

------------------------------------------------------------------------

## LAB 16 — Two DGX B300 systems

Model:

``` text
DGX0:
GPU0-7

DGX1:
GPU8-15
```

Total:

``` text
16 GPUs
2 B300 systems
```

Run AllReduce:

``` bash
./build/simccl-standalone --op AllReduce --size 4194304 \
  --nRanks 16 --nNodes 2 --gpus_per_node 8 --gpu_type H20
```

------------------------------------------------------------------------

## LAB 17 — Four DGX B300 systems

Model:

``` text
4 × DGX B300
8 GPUs/system

Total = 32 GPUs
```

Run each collective (`--nRanks 32 --nNodes 4`):

``` bash
for op in AllReduce AllGather ReduceScatter AlltoAll; do
  ./build/simccl-standalone --op $op --size 4194304 \
    --nRanks 32 --nNodes 4 --gpus_per_node 8 --gpu_type H20
  mv ncclFlowModel_detailed_flows.csv lab17_${op}.csv
done
```

------------------------------------------------------------------------

## LAB 18 — Eight DGX B300 systems

Model:

``` text
8 × DGX B300
8 GPUs/system

Total = 64 GPUs
```

``` bash
./build/simccl-standalone --op AllReduce --size 4194304 \
  --nRanks 64 --nNodes 8 --gpus_per_node 8 --gpu_type H20
```

This is the first meaningful scale-out experiment — flows now cross the
inter-node boundary, which the ns-3 simulation mode (LAB 40+) models.

------------------------------------------------------------------------

## LAB 19 — 16 DGX B300 systems

Model:

``` text
16 × DGX B300
128 GPUs
```

``` bash
./build/simccl-standalone --op AllReduce --size 4194304 \
  --nRanks 128 --nNodes 16 --gpus_per_node 8 --gpu_type H20
```

Compare against:

``` text
8 systems
64 GPUs
```

------------------------------------------------------------------------

## LAB 20 — 32 DGX B300 systems

Model:

``` text
32 × DGX B300
256 GPUs
```

``` bash
./build/simccl-standalone --op AllReduce --size 4194304 \
  --nRanks 256 --nNodes 32 --gpus_per_node 8 --gpu_type H20
```

Study collective scaling — how does flow count grow vs the 64-GPU run?

------------------------------------------------------------------------

# B300 SCALABLE UNIT

------------------------------------------------------------------------

## LAB 21 — Build the B300 1-SU model

The B300 XDR RA defines:

``` text
72 DGX B300
576 GPUs
8 leaves
4 spines
576 node-leaf connections
576 leaf-spine connections
```

Build the logical topology.

------------------------------------------------------------------------

## LAB 22 — Verify the 1-SU arithmetic

Calculate:

``` text
72 DGX × 8 GPU
= 576 GPU
```

Then:

``` text
576 node-leaf links / 72 DGX
= 8 links per DGX
```

This is an important architectural observation.

Do not automatically assume these eight links mean one independent
physical network link per GPU without checking the actual B300
connectivity diagram.

------------------------------------------------------------------------

## LAB 23 — Leaf fan-in calculation

For the 1-SU model:

``` text
576 node-leaf connections
8 leaf switches
```

Calculate:

``` text
576 / 8
```

Then determine the modeled average number of DGX-facing connections per
leaf.

------------------------------------------------------------------------

## LAB 24 — Leaf-spine calculation

Given:

``` text
576 leaf-spine connections
8 leaves
```

calculate:

``` text
576 / 8
```

Then compare the result with:

``` text
4 spines
```

------------------------------------------------------------------------

## LAB 25 — Aggregate spine capacity

Each XDR link:

``` text
800 Gbps
```

For the modeled fabric calculate:

``` text
number of leaf-spine links
×
800 Gbps
```

Then calculate aggregate bisection capacity under your chosen
abstraction.

Do this separately for:

``` text
one direction
both directions
```

------------------------------------------------------------------------

# TWIN-PLANE B300 FABRIC

------------------------------------------------------------------------

## LAB 26 — Model the twin-plane concept

Create:

``` text
Plane A
DGX -> Leaf -> Spine -> Leaf -> DGX

Plane B
DGX -> Leaf -> Spine -> Leaf -> DGX
```

The B300 XDR compute fabric is explicitly described as twin-plane.

------------------------------------------------------------------------

## LAB 27 — Single-plane baseline

Temporarily model only one plane.

Run:

``` text
AllReduce
64 GPUs
128 GPUs
256 GPUs
```

Record performance.

------------------------------------------------------------------------

## LAB 28 — Twin-plane model

Enable both planes.

Keep all other parameters identical.

Compare:

``` text
single-plane
vs
twin-plane
```

------------------------------------------------------------------------

## LAB 29 — Twin-plane traffic distribution

Inspect:

``` text
Plane A traffic
Plane B traffic
```

Determine whether the modeled traffic is balanced.

------------------------------------------------------------------------

## LAB 30 — Plane failure experiment

Remove one plane from the model.

Run the same workload.

Measure:

``` text
performance loss
```

This is a **simulation exercise**, not a claim about the exact
operational failover behavior of the production B300 RA.

------------------------------------------------------------------------

# RAIL-OPTIMIZED FABRIC

------------------------------------------------------------------------

## LAB 31 — Understand rail optimization

The B300 XDR compute fabric is described by NVIDIA as rail-optimized and
full-fat-tree.

Create a conceptual mapping:

``` text
GPU/NIC rail 0 -> fabric path 0
GPU/NIC rail 1 -> fabric path 1
...
```

Document your assumptions.

------------------------------------------------------------------------

## LAB 32 — Rail-balanced AllReduce

Run AllReduce with traffic distributed evenly across modeled rails.

Measure:

``` text
per-rail traffic
```

------------------------------------------------------------------------

## LAB 33 — Rail imbalance

Artificially concentrate communication onto fewer rails.

Compare:

``` text
balanced
vs
imbalanced
```

------------------------------------------------------------------------

## LAB 34 — Rail imbalance + AlltoAll

Repeat the previous experiment with AlltoAll.

Question:

> Why should AlltoAll expose rail imbalance more aggressively?

Validate with the simulator.

------------------------------------------------------------------------

# 800G XDR INFiniBAND EXPERIMENTS

------------------------------------------------------------------------

## LAB 35 — 800G baseline

Set the modeled compute-fabric link to:

``` text
800 Gbps
```

This is the XDR link rate specified by the B300 XDR RA.

Run:

``` text
AllReduce
64 GPUs
```

------------------------------------------------------------------------

## LAB 36 — Artificial 400G comparison

Change only the modeled network link:

``` text
800G -> 400G
```

Compare performance.

This is an experimental counterfactual, not the B300 RA configuration.

------------------------------------------------------------------------

## LAB 37 — Artificial 1600G comparison

Change:

``` text
800G -> 1600G
```

Observe the scaling.

Question:

> Is performance exactly 2× better?

Explain why not.

------------------------------------------------------------------------

## LAB 38 — Network latency sensitivity

Sweep the modeled link latency.

Plot:

``` text
latency
vs
collective completion time
```

------------------------------------------------------------------------

## LAB 39 — Message-size sensitivity at 800G

Run:

``` text
16M
64M
256M
1G
4G
```

Keep:

``` text
800G
twin-plane
rail-optimized
```

constant.

------------------------------------------------------------------------

# NON-BLOCKING / FAT-TREE BASELINE

------------------------------------------------------------------------

## LAB 40 — Build the reference baseline

Your reference configuration should be:

``` text
DGX B300
8 GPUs/node
72 nodes/SU
576 GPUs/SU
8 leaves
4 spines
800G XDR
rail optimized
twin plane
fat tree
non-blocking
```

This is your control experiment.

------------------------------------------------------------------------

## LAB 41 — Verify non-blocking capacity

For your modeled topology calculate:

``` text
aggregate downlink capacity
aggregate uplink capacity
```

Verify that your abstraction is non-blocking.

Do not simply label it non-blocking.

Show the arithmetic.

------------------------------------------------------------------------

# CONTROLLED BLOCKING EXPERIMENTS

These are **counterfactual experiments**.

They do NOT represent the NVIDIA B300 reference architecture.

They are included to answer:

> What would happen if the B300 fabric were deliberately made blocking?

------------------------------------------------------------------------

## LAB 42 — 1:2 blocked B300 fabric

Take the LAB 40 topology.

Reduce the spine-facing capacity so that:

``` text
uplink capacity ≈ 50%
downlink capacity
```

Run AllReduce.

Compare against baseline.

------------------------------------------------------------------------

## LAB 43 — 1:4 blocked B300 fabric

Reduce uplink capacity to:

``` text
25%
```

Run:

``` text
AllReduce
AllGather
ReduceScatter
AlltoAll
```

------------------------------------------------------------------------

## LAB 44 — 1:5 blocked B300 fabric

Reduce the aggregate uplink capacity to approximately:

``` text
20%
```

Run the same collectives.

Record:

``` text
baseline time
1:5 time
slowdown
```

------------------------------------------------------------------------

## LAB 45 — Blocking vs message size

For:

``` text
1:1
1:2
1:4
1:5
```

test:

``` text
16M
64M
256M
1G
```

Plot:

``` text
message size
vs
blocking slowdown
```

------------------------------------------------------------------------

# COLLECTIVE-SPECIFIC B300 STUDIES

------------------------------------------------------------------------

## LAB 46 — B300 AllReduce scaling

Run:

``` text
8
16
32
64
128
256
576 GPUs
```

Use the B300 topology abstraction.

Plot:

``` text
GPU count
vs
AllReduce time
```

------------------------------------------------------------------------

## LAB 47 — B300 AllGather scaling

Repeat LAB 46 with AllGather.

Compare the scaling curves.

------------------------------------------------------------------------

## LAB 48 — B300 ReduceScatter scaling

Repeat with ReduceScatter.

------------------------------------------------------------------------

## LAB 49 — B300 AlltoAll scaling

Repeat with AlltoAll.

This should become one of your most important experiments because it
exposes scale-out traffic behavior differently from AllReduce.

------------------------------------------------------------------------

# B300 SU-SCALE EXPERIMENTS

------------------------------------------------------------------------

## LAB 50 — 1 SU

Run:

``` text
72 DGX
576 GPUs
```

with the reference fabric.

Record:

``` text
AllReduce
AllGather
ReduceScatter
AlltoAll
```

------------------------------------------------------------------------

## LAB 51 — 2 SU

The RA example gives:

``` text
144 DGX
1152 GPUs
16 leaves
8 spines
1152 node-leaf connections
1152 leaf-spine connections
```

Model this scale.

------------------------------------------------------------------------

## LAB 52 — 4 SU

The RA example gives:

``` text
288 DGX
2304 GPUs
32 leaves
18 spines
2304 node-leaf connections
2304 leaf-spine connections
```

Notice carefully:

``` text
18 spines
```

is not simply:

``` text
4 × 4 = 16
```

Before building, cross-check this value against the spine counts in the
§12 reference table and the RA itself — treat the exercise as "explain
why the RA needs 18", not "trust the number blindly".

This is a particularly useful topology-design exercise.

------------------------------------------------------------------------

## LAB 53 — 8 SU

The reference architecture example gives:

``` text
576 DGX
4608 GPUs
64 leaves
36 spines
4608 node-leaf connections
4608 leaf-spine connections
```

Model the scale and determine:

``` text
GPU scaling
leaf scaling
spine scaling
```

------------------------------------------------------------------------

# FINAL B300 CAPSTONE

------------------------------------------------------------------------

## LAB 54 — Build an automated B300 experiment matrix

Create a matrix using only B300-reference parameters plus explicitly
labeled counterfactuals.

### Fixed reference

``` text
GPU/node        = 8
NIC/fabric      = B300 RA abstraction
link            = 800G
fabric          = rail optimized
planes          = 2
topology        = fat tree
baseline        = non-blocking
```

### Variables

``` text
GPU scale:
8
16
32
64
128
256
576

Collective:
AllReduce
AllGather
ReduceScatter
AlltoAll

Message:
16M
64M
256M
1G

Counterfactual blocking:
1:1
1:2
1:4
1:5
```

Automate the runs.

Save results as:

``` text
B300_allreduce_g64_256M_800G_1to1.csv
B300_alltoall_g576_1G_800G_1to1.csv
B300_allreduce_g576_1G_800G_1to5.csv
```

------------------------------------------------------------------------

# LAB 55 — Full B300 Reference Architecture study

This is the final project.

## Objective

Answer:

> How does collective communication behave across the NVIDIA DGX B300
> XDR Reference Architecture as the system scales from one 8-GPU DGX
> B300 to a 576-GPU scalable unit, and how sensitive is the result to
> deliberately introduced fabric blocking?

------------------------------------------------------------------------

## Part A — Model the DGX B300

``` text
8 × Blackwell Ultra GPUs
        |
5th-gen NVLink
        |
4th-gen NVSwitch
        |
network rails
```

------------------------------------------------------------------------

## Part B — Model the SU

``` text
72 DGX B300
       |
     576 GPUs
       |
   8 leaf switches
       |
   4 spine switches
       |
  800G XDR IB
```

Use the RA's 1-SU values.

------------------------------------------------------------------------

## Part C — Implement twin-plane behavior

``` text
             Plane 0
GPU -> Leaf -> Spine -> Leaf -> GPU

             Plane 1
GPU -> Leaf -> Spine -> Leaf -> GPU
```

------------------------------------------------------------------------

## Part D — Run collectives

``` text
AllReduce
AllGather
ReduceScatter
AlltoAll
```

------------------------------------------------------------------------

## Part E — Scale

``` text
8 GPUs
16 GPUs
32 GPUs
64 GPUs
128 GPUs
256 GPUs
576 GPUs
```

------------------------------------------------------------------------

## Part F — Study blocking

Compare:

``` text
Reference non-blocking
       vs
1:2
       vs
1:4
       vs
1:5
```

Clearly label the latter three as:

``` text
COUNTERFACTUAL
```

------------------------------------------------------------------------

## Part G — Study link rate

Compare:

``` text
400G   counterfactual
800G   B300 RA baseline
1600G  counterfactual
```

------------------------------------------------------------------------

## Part H — Produce the final report

Your final report should include:

### 1. Architecture diagram

``` text
             DGX B300
          8 × B300 GPUs
                 |
           NVLink/NVSwitch
                 |
              Rails
                 |
          800G XDR IB
                 |
             8 Leaves
                 |
             4 Spines
                 |
             8 Leaves
                 |
          800G XDR IB
                 |
             DGX B300
```

### 2. Collective flow diagrams

For each:

``` text
AllReduce
AllGather
ReduceScatter
AlltoAll
```

### 3. Scaling graphs

``` text
GPU count
   vs
communication time
```

### 4. Blocking graphs

``` text
blocking ratio
      vs
slowdown
```

### 5. Link-speed graphs

``` text
network bandwidth
      vs
communication time
```

### 6. Rail utilization

Show:

``` text
rail 0
rail 1
...
```

where your abstraction exposes rail-level statistics.

### 7. Plane utilization

Compare:

``` text
plane 0
plane 1
```

### 8. Bottleneck classification

For each experiment identify:

``` text
Scale-up fabric
Scale-out NIC
Leaf
Spine
Link capacity
Latency
```

### 9. Conclusions

Answer:

1.  When does scale-out become dominant?
2.  Which collective is most sensitive to fabric capacity?
3.  Does AlltoAll behave differently from AllReduce?
4.  What benefit does twin-plane provide in the model?
5.  What benefit does rail optimization provide?
6.  How much does artificial 1:5 blocking hurt?
7.  Why is the B300 RA non-blocking design important?
8.  What cannot be concluded from simulation alone?

------------------------------------------------------------------------

# NCCL ENVIRONMENT VARIABLE LABS

These labs connect the simulation work to the knobs a real SRE turns on
a production B300 cluster. Source for the variables: the NCCL 2.32 User
Guide, environment-variables chapter
(https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/env.html).

**Important honesty rule for this section:** SimCCL embeds NCCL's
decision logic, so *some* `NCCL_*` variables change its output — but
many (bootstrap, IB verbs, GDR, RAS) control real-hardware behavior the
simulator does not model. Each lab tells you to **verify by experiment**
rather than assume. If an env var produces identical CSVs, that is the
answer: SimCCL ignores it, and the variable only matters on real
clusters. Record such findings as `ABSTRACTION`.

The general experiment pattern is:

``` bash
# baseline
./build/simccl-standalone --op AllReduce --size 4194304 \
  --nRanks 8 --nNodes 1 --gpus_per_node 8 --gpu_type H20
mv ncclFlowModel_detailed_flows.csv baseline.csv

# with the variable set
NCCL_SOMETHING=value ./build/simccl-standalone --op AllReduce --size 4194304 \
  --nRanks 8 --nNodes 1 --gpus_per_node 8 --gpu_type H20
diff baseline.csv ncclFlowModel_detailed_flows.csv
```

------------------------------------------------------------------------

## LAB 56 — Seeing what NCCL decided: `NCCL_DEBUG`

On a real cluster the first triage knob is:

``` text
NCCL_DEBUG=INFO
NCCL_DEBUG_SUBSYS=INIT,GRAPH,NET    # filter to relevant subsystems
NCCL_DEBUG_FILE=nccl.%h.%p.log      # one log per host/pid at scale
```

`INFO` logs show which algorithm, protocol, channels, and transport NCCL
selected — the same information SimCCL's CSV encodes.

### Experiment

1. Run the canonical command with `NCCL_DEBUG=INFO` set. Does SimCCL
   print anything extra? Document the result either way.
2. Write down which real-NCCL log lines correspond to columns in
   `ncclFlowModel_detailed_flows.csv`.

### Deliverable

A short mapping: `real NCCL log line -> SimCCL CSV field`.

------------------------------------------------------------------------

## LAB 57 — Forcing the algorithm: `NCCL_ALGO`

`NCCL_ALGO` restricts which algorithms real NCCL may use
(`Tree`, `Ring`, `Collnet_*`, `NVLS`, `NVLSTree`; `^` excludes). On real
B300 systems this is how you isolate an algorithmic regression.

### Experiment

``` bash
for algo in Ring NVLS Tree; do
  NCCL_ALGO=$algo ./build/simccl-standalone --op AllReduce --size 4194304 \
    --nRanks 8 --nNodes 1 --gpus_per_node 8 --gpu_type H20
  mv ncclFlowModel_detailed_flows.csv lab57_${algo}.csv
done
```

Compare the three CSVs.

### Expected finding

Per the SimCCL algorithm matrix (§8), AllReduce models Ring and NVLS —
so at most two of the three runs should differ. If `Tree` falls back to
Ring or is ignored, that tells you SimCCL's support boundary.

### Question

> On a real 8-GPU B300 (NVSwitch present), why would NVLS beat Ring for
> AllReduce?

------------------------------------------------------------------------

## LAB 58 — Forcing the protocol: `NCCL_PROTO`

`NCCL_PROTO` restricts the transfer protocol: `LL`, `LL128`, `Simple`.
Real NCCL picks per message size — LL favors latency on small messages,
Simple favors bandwidth on large ones.

### Experiment

Sweep `NCCL_PROTO=LL,LL128,Simple` at `--size` 16384, 4194304, and
1073741824. For each run record the flow count and chunking in the CSV.

### Question

> Which protocol would you expect NCCL to choose for a 16 KiB AllReduce
> vs a 1 GiB AllReduce, and why?

------------------------------------------------------------------------

## LAB 59 — Channels, buffers, CTAs: `NCCL_BUFFSIZE`, `NCCL_MAX_CTAS`, `NCCL_MIN_CTAS`, `NCCL_NTHREADS`

Real-cluster meaning:

- `NCCL_BUFFSIZE` (default 4 MiB) — per-connection buffer; larger values
  help big messages, smaller saves memory.
- `NCCL_MAX_CTAS` / `NCCL_MIN_CTAS` — cap/floor the SMs used for comms
  (replaced the deprecated `NCCL_MAX_NCHANNELS`/`_MIN_NCHANNELS` in
  NCCL 2.17). SREs lower `MAX_CTAS` when comms starve compute kernels.
- `NCCL_NTHREADS` — CUDA threads per NCCL kernel block.

### Experiment

Vary `NCCL_BUFFSIZE` (e.g. 1 MiB, 4 MiB, 16 MiB) on the 8-GPU AllReduce
and diff the CSVs. Watch whether chunk counts change — buffers directly
influence how a message is split into flows.

------------------------------------------------------------------------

## LAB 60 — The NVLink domain: `NCCL_NVLS_ENABLE`, `NCCL_P2P_DISABLE`, `NCCL_NVB_DISABLE`, `NCCL_MNNVL_ENABLE`

This is the scale-up layer of the B300 node:

- `NCCL_NVLS_ENABLE` — NVLink SHARP: in-NVSwitch reduction. Default 2
  (use if supported); set 0 to debug. SimCCL uses NVLS for single-node
  ≥8-GPU AllReduce — exactly the DGX B300 case.
- `NCCL_P2P_DISABLE` — disable direct GPU↔GPU CUDA transfers (debug).
- `NCCL_NVB_DISABLE` — disable relaying via an intermediate NVLink GPU.
- `NCCL_MNNVL_ENABLE` — multi-node NVLink (GB200/GB300 NVL72 domains);
  not applicable to DGX B300 XDR, which is why this lab manual models
  scale-out over IB.

### Experiment

``` bash
NCCL_NVLS_ENABLE=0 ./build/simccl-standalone --op AllReduce --size 4194304 \
  --nRanks 8 --nNodes 1 --gpus_per_node 8 --gpu_type H20
diff baseline.csv ncclFlowModel_detailed_flows.csv
```

If the flows change (e.g. NVLS → Ring), you have demonstrated the
NVSwitch offload effect in simulation. If they do not, record it as a
SimCCL limitation.

------------------------------------------------------------------------

## LAB 61 — Rails and NIC placement: `NCCL_CROSS_NIC`, `NCCL_IB_HCA`, `NCCL_IB_RAIL_POLICY`, `NCCL_NET_MERGE_POLICY`, `NCCL_PXN_DISABLE`

These map directly onto the rail-optimized labs (31-34):

- `NCCL_IB_HCA` — pin NCCL to specific HCAs/ports: the real-world way to
  express "GPU rail i uses NIC i".
- `NCCL_IB_RAIL_POLICY` — automatic rail/plane assignment for ConnectX
  SuperNICs (default `CX9` since NCCL 2.30.5) — the knob that maps NCCL
  traffic onto the B300 rail-optimized fabric.
- `NCCL_NET_MERGE_POLICY` — `ALL` (default) vs `RAIL`: whether HCAs on
  different rails may be merged into one virtual NIC. On a rail-optimized
  fabric, cross-rail merging defeats the design.
- `NCCL_CROSS_NIC` — allow ring/tree endpoints on different NICs (0
  strict, 2 default). Setting 0 keeps traffic on its rail.
- `NCCL_PXN_DISABLE` — PXN sends inter-node traffic through a non-local
  NIC via an intermediate GPU over NVLink; disabling it forces each GPU
  to use only its own rail NIC.

### Experiment (mostly analytical)

1. Map each variable onto the LAB 31 conceptual diagram
   (`GPU/NIC rail i -> fabric path i`).
2. Try `NCCL_PXN_DISABLE=1` and `NCCL_CROSS_NIC=0` on a 2-node
   (`--nNodes 2`) AllReduce in SimCCL and diff the CSVs.
3. Explain in your report which of these vars the simulator models and
   which are real-fabric-only (`ABSTRACTION` notes).

------------------------------------------------------------------------

## LAB 62 — IB transport knobs: `NCCL_IB_TIMEOUT`, `NCCL_IB_RETRY_CNT`, `NCCL_IB_QPS_PER_CONNECTION`, `NCCL_IB_ADAPTIVE_ROUTING`, `NCCL_IB_GID_INDEX`

These live one layer below what SimAI's topology files describe — they
configure the verbs-level behavior of the 800G XDR fabric itself:

- `NCCL_IB_TIMEOUT` (default 20 on NCCL ≥ 2.23) / `NCCL_IB_RETRY_CNT`
  (default 7) — how long a queue pair waits and retries before failing.
  First things to check for `IB completion error` on congested fabrics.
- `NCCL_IB_QPS_PER_CONNECTION` (default 1) + `NCCL_IB_SPLIT_DATA_ON_QPS` —
  spread one connection's flows over multiple queue pairs, which changes
  how traffic hashes onto ECMP paths through the leaf-spine fabric.
- `NCCL_IB_ADAPTIVE_ROUTING` — on by default on IB; adaptive routing is
  part of how Quantum-X800 fabrics avoid hot spots.
- `NCCL_IB_GID_INDEX` — RoCE-only GID selection; N/A on real InfiniBand
  but a classic cause of init hangs on Ethernet/RoCE clusters.

### Experiment

This is a reasoning lab, not a SimCCL run:

1. For each variable, write one sentence on which B300 fabric layer it
   controls (NIC queue pairs / path selection / error recovery).
2. Connect `NCCL_IB_QPS_PER_CONNECTION` to the rail-imbalance results of
   LAB 33: why can more QPs per connection reduce imbalance on an
   ECMP-hashed fabric?
3. Optional: check whether ns-3 simulation mode exposes per-flow path
   statistics that would let you emulate QP spreading.

------------------------------------------------------------------------

## LAB 63 — Switch offload and topology override: `NCCL_COLLNET_ENABLE`, `NCCL_TOPO_FILE`, `NCCL_TOPO_DUMP_FILE`

- `NCCL_COLLNET_ENABLE` — enables CollNet/SHARP in-network reduction on
  SHARP-capable IB fabrics. **SimCCL does not implement CollNet** — so
  this variable is real-cluster-only here, but it matters: on a SHARP
  fabric, AllReduce traffic is reduced *inside* the switches, which
  would invalidate leaf/spine flow counts from simulation.
- `NCCL_TOPO_FILE` / `NCCL_TOPO_DUMP_FILE` — inject/dump an XML topology
  description. This is the real-hardware analogue of a SimAI topology
  file: on a real cluster you would dump NCCL's detected topology and
  compare it against the B300 wiring; in simulation you *write* the
  topology instead of discovering it.

### Experiment

1. Set `NCCL_COLLNET_ENABLE=1` on the canonical run and diff the CSV —
  expect no change; document the finding.
2. Write a paragraph: "What would SHARP offload do to the LAB 41
   bisection-capacity analysis?" (Hint: switch-side reduction reduces
   bytes crossing leaf→spine links.)
3. Compare `NCCL_TOPO_DUMP_FILE` (real: discover) vs the SimAI topology
   file (simulation: prescribe). Which do you trust when they disagree?

------------------------------------------------------------------------

## LAB 64 — Bootstrap and large-scale reliability (real-cluster awareness)

These vars affect how NCCL jobs *start and survive* — layers the
simulator does not model at all, but every B300 SRE must know:

- `NCCL_SOCKET_IFNAME` — wrong-NIC selection is the #1 cause of "NCCL
  hangs at init". The fix is pinning the bootstrap interface.
- `NCCL_SOCKET_RETRY_CNT` / `NCCL_SOCKET_RETRY_SLEEP_MSEC` /
  `NCCL_SOCKET_POLL_TIMEOUT_MSEC` — bootstrap connect retries and dead-peer
  detection; critical at 576+ ranks where connect bursts get refused.
- `NCCL_UID_STAGGER_THRESHOLD` / `_RATE` — staggers uniqueId broadcast
  for jobs above 256 ranks.
- `NCCL_RUNTIME_CONNECT` — lazy vs eager connection setup; set 0 to
  fail fast at init instead of on first use.
- `NCCL_RAS_*` — the RAS subsystem lets you introspect a *stuck* job
  with the `ncclras` client (`NCCL_RAS_ADDR`, `NCCL_RAS_TIMEOUT_FACTOR`).

### Experiment

1. For each variable, state which failure mode on a 576-GPU B300 job it
   addresses (init hang / connect storm / stuck job / wrong NIC).
2. Explain why none of them change a SimCCL CSV — which simulation layer
   (§2, Layers 1-3) is missing?
3. Write the "first three commands" you would run when a real 72-node
   AllReduce hangs at init. (Expected answer shape:
   `NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,BOOTSTRAP` rerun, check
   `NCCL_SOCKET_IFNAME`, query RAS.)

------------------------------------------------------------------------

# 12. B300 topology reference table

Use this as the primary architecture reference for the labs.

    SU   DGX B300    GPUs   Leaves   Spines   Node-leaf   Leaf-spine
  ---- ---------- ------- -------- -------- ----------- ------------
     1         72     576        8        4         576          576
     2        144   1,152       16        8       1,152        1,152
     4        288   2,304       32       18       2,304        2,304
     8        576   4,608       64       36       4,608        4,608
    18      1,296   9,216      144       72      10,368       10,368

These are the example compute-fabric counts published in the B300 XDR
reference architecture.

------------------------------------------------------------------------

# 13. Why the 4-SU experiment is especially important

Notice the spine progression:

``` text
1 SU  -> 4 spines
2 SU  -> 8 spines
4 SU  -> 18 spines
8 SU  -> 36 spines
```

The 4-SU case is particularly useful because:

``` text
4 × 4 = 16
```

but the RA specifies:

``` text
18 spines
```

This means you should **not extrapolate the architecture with a
simplistic linear formula**.

Instead:

``` text
RA values
   ↓
topology constraints
   ↓
port/cabling requirements
   ↓
actual switch count
```

That is precisely the kind of reasoning the topology labs are intended
to teach.

------------------------------------------------------------------------

# 14. SimAI mapping strategy

SimAI's current topology generator provides generic templates and
parameters such as:

``` text
GPU count
GPU/server
GPU type
NVLink bandwidth
NVLink latency
NIC bandwidth
ASW count
NICs per switch
PSW count
ASW-to-PSW bandwidth
ASW per PSW
```

The current SimAI tutorial documents these topology parameters and
supports rail-optimized, dual-plane and dual-ToR configurations
depending on the selected template.

For this B300 course, do **not** blindly select a generic H100
Spectrum-X template and call it B300.

Instead create a documented B300 parameter mapping.

Example:

``` text
B300 RA
   |
   +-- GPU count
   +-- GPUs/DGX
   +-- 800G XDR
   +-- leaf count
   +-- spine count
   +-- twin plane
   +-- rail optimization
   |
   v
SimAI topology abstraction
```

------------------------------------------------------------------------

# 15. Important limitation: B300 vs SimAI built-in GPU templates

SimAI's examples commonly use GPU labels such as:

``` text
H100
A100
```

That does not mean the simulator understands all physical B300 behavior.

For the B300 labs, distinguish:

``` text
B300 architectural topology
```

from:

``` text
B300 physical performance model
```

The first can be modeled using topology parameters.

The second requires much more detailed hardware characterization and
should not be inferred simply from a GPU-name parameter.

------------------------------------------------------------------------

# 16. Recommended result format

Every experiment should produce:

``` text
experiment_id
architecture = B300-XDR
SU count
DGX count
GPU count
GPU/DGX
leaf count
spine count
planes
rail optimization
link rate
collective
message size
algorithm
protocol
simulated time
flow count
bottleneck
```

------------------------------------------------------------------------

# 17. Recommended directory layout

``` text
b300-simai-labs/
│
├── README.md
│
├── configs/
│   ├── b300_1su.yaml
│   ├── b300_2su.yaml
│   ├── b300_4su.yaml
│   └── b300_8su.yaml
│
├── topologies/
│   ├── b300_1su/
│   ├── b300_2su/
│   ├── b300_4su/
│   └── b300_8su/
│
├── workloads/
│   ├── allreduce/
│   ├── allgather/
│   ├── reducescatter/
│   └── alltoall/
│
├── scripts/
│   ├── run_simccl.py
│   ├── run_simai.py
│   ├── sweep_collectives.py
│   ├── sweep_scale.py
│   ├── sweep_blocking.py
│   └── plot_results.py
│
└── results/
```

------------------------------------------------------------------------

# 18. Rules for interpreting the results

Use three labels:

``` text
REFERENCE
```

when the experiment matches the B300 RA.

``` text
ABSTRACTION
```

when SimAI cannot represent the exact hardware and you use a documented
model.

``` text
COUNTERFACTUAL
```

when you deliberately change the B300 RA.

For example:

``` text
800G XDR + twin plane + non-blocking
= REFERENCE

400G link
= COUNTERFACTUAL

1:5 blocking
= COUNTERFACTUAL

B300 GPU label with generic H100 timing model
= ABSTRACTION
```

This prevents accidental claims that a simulator experiment is an NVIDIA
specification.

------------------------------------------------------------------------

# 19. The three most important experiments

If you have limited time, do these first:

## Experiment A

``` text
8 GPUs
      ↓
AllReduce
      ↓
SimCCL
      ↓
flow decomposition
```

## Experiment B

``` text
576 GPUs
      ↓
B300 1-SU
      ↓
8 leaves / 4 spines
      ↓
800G twin-plane
      ↓
AllReduce
```

## Experiment C

``` text
Same B300 topology

Reference:
1:1

Counterfactual:
1:2
1:4
1:5

       ↓

Compare AllReduce vs AlltoAll
```

Those three experiments connect the entire learning chain:

``` text
NCCL
 ↓
collective
 ↓
SimCCL
 ↓
flows
 ↓
B300 topology
 ↓
XDR
 ↓
leaf/spine
 ↓
blocking
 ↓
performance
 ↓
NCCL_* env vars (labs 56-64 — the same reasoning on a real cluster)
```

------------------------------------------------------------------------

# 20. Official references

### NVIDIA DGX B300 XDR Reference Architecture

https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-b300-xdr/latest/

### NVIDIA DGX B300 XDR Reference Architecture PDF

https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-b300-xdr/latest/\_downloads/f2d6423ee942e3f144511f5df58e3080/RA11339001-DSPB300-XDR-ReferenceArch.pdf

### SimAI

https://github.com/aliyun/SimAI

### SimAI Tutorial

https://github.com/aliyun/SimAI/blob/master/docs/Tutorial.md

### SimCCL

https://github.com/aliyun/SimCCL

### NCCL Collectives

https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/usage/collectives.html

------------------------------------------------------------------------

# 21. Final learning objective

After completing these 55 labs, you should be able to look at a B300
reference architecture and reason through:

``` text
How many GPUs?
       ↓
How many DGX systems?
       ↓
How many rails?
       ↓
How does a collective decompose?
       ↓
Which flows leave a DGX?
       ↓
Which flows cross a leaf?
       ↓
How many spine links are available?
       ↓
Is the fabric non-blocking?
       ↓
What happens with twin planes?
       ↓
What happens with rail imbalance?
       ↓
What happens if the fabric is artificially blocked?
       ↓
Which collective suffers most?
```

That is the core skill this lab series is designed to develop — and on
a real cluster, the same reasoning happens through the `NCCL_*`
environment variables covered in labs 56-64.

------------------------------------------------------------------------

# Appendix A — NCCL environment-variable quick reference

"Honored by SimCCL?" is your job to verify with the diff pattern from
LAB 56's preamble — where it is undocumented, treat it as `unknown —
verify` and record your finding.

  Variable                     Controls                         Honored by SimCCL?      Related lab
  ---------------------------- -------------------------------- ---------------------- -----------
  NCCL_DEBUG / _SUBSYS / _FILE What NCCL logs                   unknown — verify       LAB 56
  NCCL_ALGO                    Algorithm whitelist              likely (NCCL tuning    LAB 57
                                                               code is embedded)
  NCCL_PROTO                   Protocol whitelist (LL/LL128/     unknown — verify       LAB 58
                               Simple)
  NCCL_BUFFSIZE                Per-connection buffer →          unknown — verify       LAB 59
                               chunking
  NCCL_MAX_CTAS / NCCL_MIN_    SM budget for comm kernels       unknown — verify       LAB 59
  CTAS / NCCL_NTHREADS
  NCCL_NVLS_ENABLE             NVSwitch (NVLink SHARP)           unknown — verify       LAB 60
                               collectives
  NCCL_P2P_DISABLE /           Intra-node transports             unknown — verify       LAB 60
  NCCL_NVB_DISABLE
  NCCL_MNNVL_ENABLE            Multi-node NVLink (NVL72)         no (not DGX B300       LAB 60
                                                               XDR)
  NCCL_IB_HCA                  HCA/port pinning = rails          no — real fabric       LAB 61
  NCCL_IB_RAIL_POLICY          Auto rail/plane assignment        no — real fabric       LAB 61
                               (CX9 SuperNIC)
  NCCL_NET_MERGE_POLICY        Merge HCAs across rails           no — real fabric       LAB 61
  NCCL_CROSS_NIC               Rings/trees spanning NICs         unknown — verify       LAB 61
  NCCL_PXN_DISABLE             Inter-node via non-local NIC      unknown — verify       LAB 61
  NCCL_IB_TIMEOUT / _RETRY_CNT QP error recovery                no — real fabric       LAB 62
  NCCL_IB_QPS_PER_CONNECTION   Flow hashing over ECMP            partially — ns-3       LAB 62
  (+_SPLIT_DATA_ON_QPS)                                        path layer only
  NCCL_IB_ADAPTIVE_ROUTING     AR on Quantum-X800                no — real fabric       LAB 62
  NCCL_IB_GID_INDEX            RoCE GID selection                no (IB, not RoCE)      LAB 62
  NCCL_COLLNET_ENABLE          SHARP in-switch reduction         no — not implemented   LAB 63
  NCCL_TOPO_FILE / _DUMP_FILE  Inject/dump topology XML          no — SimAI topo file   LAB 63
                                                               is the analogue
  NCCL_SOCKET_IFNAME /         Bootstrap connectivity            no — not simulated     LAB 64
  _RETRY_* / _POLL_TIMEOUT
  NCCL_UID_STAGGER_*           uniqueId broadcast pacing         no — not simulated     LAB 64
  NCCL_RUNTIME_CONNECT         Lazy vs eager connect             no — not simulated     LAB 64
  NCCL_RAS_*                   Stuck-job introspection           no — not simulated     LAB 64
  NCCL_SOCKET_NTHREADS /       TCP-fallback throughput           no — real fabric       LAB 64
  NCCL_NSOCKS_PERTHREAD
  NCCL_OOB_NET_*               Bootstrap over the fast fabric    no — real fabric       LAB 64

### SRE symptom → first variables (from the NCCL 2.32 guide)

  Symptom                              Try first
  ------------------------------------ ---------------------------------------------
  Hangs at init / wrong interface      NCCL_SOCKET_IFNAME, NCCL_DEBUG=INFO,
                                       NCCL_DEBUG_SUBSYS=INIT,BOOTSTRAP
  IB/RoCE path misbehaving             NCCL_IB_HCA, NCCL_IB_GID_INDEX,
                                       NCCL_IB_DISABLE=1 (isolate to TCP)
  Slow collectives                     NCCL_ALGO, NCCL_PROTO, NCCL_BUFFSIZE,
                                       NCCL_TOPO_DUMP_FILE (check detection)
  GDR not engaging                     NCCL_NET_GDR_LEVEL, NCCL_DMABUF_ENABLE
  Large-job bootstrap failures         NCCL_SOCKET_RETRY_CNT, NCCL_UID_STAGGER_*
  Stuck job introspection              NCCL_RAS_* + ncclras client

------------------------------------------------------------------------

# Appendix B — Glossary

  Term                Meaning
  ------------------- --------------------------------------------------
  Collective          One communication op involving all ranks
                      (AllReduce, AllGather, ReduceScatter, AlltoAll,
                      Broadcast).
  Rank                One participant in a collective — in these labs,
                      one rank = one GPU.
  AllReduce           Sum (etc.) all ranks' data; every rank gets the
                      result. = ReduceScatter + AllGather.
  AllGather           Every rank contributes a shard; every rank ends
                      with all shards.
  ReduceScatter       Sum all ranks' data; each rank keeps one shard of
                      the result.
  AlltoAll            Every rank sends a distinct piece to every other
                      rank — the densest traffic pattern.
  Ring algorithm      Ranks form a cycle; data flows hop-by-hop. Low
                      fan-out, many hops.
  Tree algorithm      Ranks form a parent/child tree. Fewer hops,
                      higher fan-out. SimCCL does not auto-select it.
  NVLS                NVLink SHARP — reduction performed inside the
                      NVSwitch. Used by SimCCL for single-node ≥8-GPU
                      AllReduce.
  PAT                 Parallel array tree — SimCCL algorithm for
                      multi-node 1-GPU/node AllGather/ReduceScatter.
  Protocol            How bytes move on a link: LL / LL128 (latency-
                      optimized, small messages) and Simple (bandwidth,
                      large messages). Set via NCCL_PROTO.
  Channel             An independent parallel path NCCL uses for one
                      collective; more channels = more parallelism.
  Chunk               One slice of a message assigned to a channel.
  Scale-up            GPU↔GPU fabric inside a node (NVLink/NVSwitch).
  Scale-out           Node↔node fabric (here: 800G XDR InfiniBand).
  Rail                One GPU's dedicated path into the fabric
                      (GPU i -> NIC i -> plane/leaf i). A rail-optimized
                      fabric keeps each rail's traffic on its own path.
  Twin-plane          Two physically separate leaf/spine networks; the
                      B300 fabric runs one plane per rail group.
  Leaf / spine        The two tiers of the fat tree: leaves face the
                      nodes, spines connect leaves.
  Fat tree            Multi-stage switch topology where uplink capacity
                      matches downlink capacity.
  Bisection bandwidth Total capacity crossing the middle of the fabric;
                      the non-blocking test in LAB 41.
  Blocking ratio      downlink : uplink capacity. 1:1 = non-blocking;
                      1:2/1:4/1:5 labs are deliberate counterfactuals.
  PXN                 Inter-node send through a *non-local* NIC via a
                      peer GPU over NVLink (NCCL_PXN_*).
  SHARP / CollNet     In-switch reduction offload on InfiniBand —
                      reduces bytes crossing leaf→spine links. Not
                      implemented in SimCCL.
  GDR                 GPU Direct RDMA — NIC reads/writes GPU memory
                      directly (NCCL_NET_GDR_*).
  SU                  Scalable unit: 72 DGX B300 / 576 GPUs in the RA.
  busbw               SimAI-Analytical's "bus bandwidth" abstraction —
                      effective algorithmic bandwidth of a collective.
  Workload file       Text file describing a training step's ops;
                      simccl-standalone `-w` and SimAI `-w` consume it.

------------------------------------------------------------------------

# Appendix C — Troubleshooting

  Symptom                              Likely cause / fix
  ------------------------------------ -------------------------------------------------
  `git submodule` empty dirs           Re-run `git submodule update --init --recursive`
                                       then `git submodule update --remote`.
  ns-3 build fails in an NGC image     `apt remove ninja-build && pip uninstall ninja`.
  `./build/simccl-standalone: No such  You ran from the wrong directory — the binary is
  file`                                at `SimAI/SimCCL/src/build/`; also confirm
                                       `bash build.sh v2.30` completed.
  SimCCL build fails on includes       SimCCL must sit inside a SimAI checkout
                                       (`SimAI/SimCCL/` next to
                                       `SimAI/astra-sim-alibabacloud/`); a standalone
                                       clone does not compile.
  CSV identical to previous run        The output file is overwritten each run —
                                       `mv`/`cp` it between experiments.
  Expected Tree algorithm never        Working as implemented: SimCCL does not
  appears                              auto-select Tree (§8 matrix). See LAB 15/57.
  NVLS never selected                  NVLS requires single-node ≥8 GPUs in SimCCL;
                                       multi-node runs fall back to Ring.
  AlltoAll output has no ring          Working as implemented: AlltoAll is Ring-only
                                       in SimCCL; check you are reading flow pairs,
                                       not an algorithm label.
  Huge run (576 ranks) is slow/empty   Standalone CSVs scale with rank² pairs for
                                       AlltoAll — inspect with `wc -l`/`head`, not
                                       interactive editors.
  Numbers differ from an NVIDIA blog   Expected — SimCCL models NCCL decisions and
  post                                 flows, not B300 silicon timings
                                       (`ABSTRACTION`).

------------------------------------------------------------------------
