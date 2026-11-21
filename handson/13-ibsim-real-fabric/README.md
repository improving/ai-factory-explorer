# H13 — ibsim: a real InfiniBand fabric simulator (no hardware required)

**Serves:** M3 - Compute fabric;
[IB10](lab10/README.md) and [IB20](lab20/README.md) also serve the game day of M7.

**Why:** H12 (`12-infiniband-fabric`) uses Mokka's mock-IB shim to practice single-node HCA inventory commands.
That works for HCA inventory, but H12 builds a full-mesh fabric by construction,
has no Subnet Manager, and cannot demonstrate switches, routing,
or topology at all (`12-infiniband-fabric/README.md`'s own "What this does not prove" section states this directly).
This module is the next tier up: **`ibsim`**,
the upstream [linux-rdma](https://github.com/linux-rdma) project's userspace InfiniBand fabric simulator,
paired with an unmodified **[OpenSM](https://github.com/linux-rdma/opensm)** and **[rdma-core](https://github.com/linux-rdma/rdma-core)**'s `infiniband-diags` toolset.
Every command in every lab here is the real binary,
run against a real (simulated) fabric: not a mock, not a stub, not invented output.
See [CAPABILITIES.md](CAPABILITIES.md) for the precise,
verified boundary of what that proves and what it does not,
and [ARCHITECTURE.md](ARCHITECTURE.md) for how the mechanism works.

## Environment

| Environment | Works? | Notes |
|---|---|---|
| **Docker container (any host OS)** | **Yes. This is the tested, recommended path** | Every command in this module was verified in a plain `ubuntu:24.04` container. It works identically on Linux, macOS (Docker Desktop), and Windows (Docker Desktop/WSL2), because `ibsim` never touches the host kernel. It is a userspace MAD simulator reachable via `LD_PRELOAD` and Unix/TCP sockets. |
| **Native Ubuntu Linux (bare metal or full VM)** | Yes | Skip the Docker layer. Run `apt-get install` from `setup/install.sh` directly on the host/VM. |
| **A Linux VM on macOS or Windows** (Multipass, UTM, Lima, VirtualBox, a cloud instance) | Yes | Needed for **IB19 only** (Soft-RoCE/RXE needs a real kernel module, which no container gives you). IB01-IB18 and IB20 do not need this. |
| **WSL2 (Windows)** | Yes, via Docker Desktop's WSL2 backend, or natively if you install the packages inside your WSL2 Ubuntu distro | The same caveat as native Linux applies for IB19. Check whether your WSL2 kernel build includes or allows `rdma_rxe` before you rely on it. |
| **Bare macOS host (no Docker, no VM)** | **No. Do not attempt this** | There is no `ibsim`/`opensm`/`infiniband-diags` build for macOS, and no IB/UMAD stack on macOS at all. Every lab in this module needs a Linux (real or containerized) environment. |
| **A cloud GPU instance's host OS directly, with real IB hardware present** | Not what this module is for | If you have real InfiniBand hardware, most of what these labs teach applies directly. But you do not need `ibsim` to learn it; use the real diagnostics against your real fabric instead. This module exists specifically for the *no-hardware* case. |

**This module's own tooling (`setup/`, `scripts/`, `Makefile`) always uses the Docker path.**
That path is the one guaranteed to work identically for every reader, regardless of host OS.
If you are on native Ubuntu and prefer to skip Docker,
`setup/install.sh`'s printed apt commands work directly on the host.
Replace every `docker exec ibsim-lab ...` in the labs with a bare shell command,
and skip `start-sim.sh`'s `docker run` step, in favor of running `ibsim` directly.

## Install

```bash
cd 13-ibsim-real-fabric
./setup/install.sh     # docker build; also prints the apt + from-source commands directly
./setup/verify.sh       # ibsim --help / ibnetdiscover --help / opensm --version / ldconfig checks
```

See [`setup/install.sh`](setup/install.sh) for exact, verified package names.
Notably: **the package is `ibsim-utils`, not `ibsim`.**
The binary is `ibsim`; `ibsim-utils` is the Ubuntu/Debian package name,
confirmed on both Ubuntu 22.04 "jammy" and 24.04 "noble".
Tested package versions on 24.04: `ibsim-utils 0.10-2build1`,
`opensm 3.3.23-2`, `infiniband-diags 50.0-2ubuntu0.2`, `rdma-core 50.0-2ubuntu0.2`.

## How to use this module

Read [ARCHITECTURE.md](ARCHITECTURE.md) and [CAPABILITIES.md](CAPABILITIES.md) once, up front.
Every lab links back to them instead of re-explaining the same concepts.
Then work `lab01` through `lab20` in order.
Each README states its prerequisites (usually "the previous lab's workflow," not its exact state).
Every lab starts from a clean `scripts/reset.sh`.

```
13-ibsim-real-fabric/
├── README.md              <- you are here
├── ARCHITECTURE.md         fabric concepts, ASCII diagrams, control-plane vs. data-plane
├── CAPABILITIES.md         the verified simulation-vs-reality boundary, feature by feature
├── setup/                  Dockerfile, install.sh, verify.sh
├── topologies/             every .net file used across the 20 labs
├── scripts/                start/stop/discover/routes/trace/failure/recover/diagnose/reset
├── Makefile                convenience wrapper over scripts/
└── lab01/ ... lab20/       one folder per lab
```

## Lab index

| Lab | Topic | Difficulty | Main tools | What it teaches |
|---|---|---|---|---|
| 01 | Verify the environment | Beginner | `docker`, `which`, `--version` | What each package/binary is |
| 02 | Your first simulated fabric | Beginner | `ibsim`, `ibnetdiscover` | The `LD_PRELOAD` mechanism, topology file format |
| 03 | GUIDs, LIDs, ports, GIDs | Beginner | `smpquery`, `ibstat`, `ibaddr` | Addressing model, empirically |
| 04 | Introduce OpenSM | Beginner-Intermediate | `opensm` | The SM state machine, `SUBNET UP` |
| 05 | Two-switch fabric | Intermediate | `ibnetdiscover` | Multi-hop discovery, single point of failure |
| 06 | Multi-path fabric | Intermediate | `ibroute`, `ibtracert` | No-ECMP LID forwarding, tie-breaking |
| 07 | `ibnetdiscover` deep dive | Intermediate | `ibnetdiscover -s`, `ibswitches`, `ibhosts` | Every output field, directed-route discovery |
| 08 | `ibroute` | Intermediate | `ibroute` | Reading/predicting forwarding tables |
| 09 | `ibtracert` | Intermediate | `ibtracert` | End-to-end path tracing vs. table reading |
| 10 | Link failure simulation | Intermediate-Advanced | `ibsim` console, OpenSM log | Real trap-driven re-routing |
| 11 | "Packet drop" simulation | Advanced | `ibsim` console `Error` | Management-plane vs. data-plane faults |
| 12 | OpenSM troubleshooting | Advanced | all of the above | A symptom-driven decision tree |
| 13 | Partitions and P_Key | Advanced | `partitions.conf`, `smpquery pkeytable` | Config vs. enforcement |
| 14 | Advanced OpenSM routing | Advanced | `opensm -R` | Routing engines change real forwarding tables |
| 15 | Fabric change / SM recalculation | Advanced | `ibsim` console `Link` | Live topology growth, no restart |
| 16 | Data center fabric at scale | Advanced | 18-node topology | Clos resilience vs. single-ISL fragility |
| 17 | Failure injection / chaos lab | Advanced | everything above | Incident-response synthesis |
| 18 | Troubleshooting runbook | Advanced | everything above | A reusable reference |
| 19 | Soft-RoCE/RXE | Advanced (real Linux only) | `rdma`, `ib_write_bw` | RDMA verbs without `ibsim`, and why they are separate |
| 20 | Capstone | Expert | everything above | Independent multi-fault diagnosis |

## Final learning path

```
Level 1   Linux + InfiniBand concepts           (ARCHITECTURE.md)
   |
Level 2   ibsim basics                          (IB01-IB03)
   |
Level 3   Topology + discovery                  (IB02, IB05, IB07)
   |
Level 4   OpenSM                                (IB04)
   |
Level 5   Routing                               (IB06, IB08, IB09, IB14)
   |
Level 6   Failure injection                     (IB10, IB11, IB15, IB17)
   |
Level 7   Advanced fabric troubleshooting        (IB12, IB13, IB16, IB18)
   |
Level 8   RXE / RDMA                            (IB19)
   |
Level 9   Production InfiniBand concepts         (CAPABILITIES.md's real-hardware notes throughout)
   |
Level 10  Capstone incident                       (IB20)
```

## What I still need real InfiniBand hardware for

Read [CAPABILITIES.md](CAPABILITIES.md) for the full, feature-by-feature table.
In summary, this module, however thorough, cannot teach you:

- **Real data-plane behavior:** RDMA sends, writes, and reads;
  queue pair state machines; real bandwidth and latency numbers.
  (IB19's RXE gives you the *verbs API* over software Ethernet,
  which is closer but is still not InfiniBand.)
- **Physical-layer troubleshooting:** marginal cables, optics degradation,
  bit-error-rate creep, temperature-induced flapping.
  None of this exists in a MAD-only simulator.
- **Vendor switch/HCA firmware behavior, NOS-specific CLI quirks, or vendor diagnostic tools.**
  `ibsim`'s simulated devices are generic; no vendor firmware exists to differ from.
- **P_Key/partition *enforcement*.**
  IB13 proves the configuration is correct.
  Only a real switch ASIC that enforces P_Keys against real data traffic proves enforcement.
- **Congestion, adaptive routing, credit-based flow control,
  or anything QoS-related,** under real load.
- **Multi-subnet routing** through real IB routers.
- **Acceptance-test-scale behavior:** convergence time, discovery time,
  and failure-recovery timing on a fabric with hundreds or thousands of ports.
  This module's 18-node `datacenter.net` topology is large enough to *see* Clos resilience,
  not to *measure* production-scale timing.

For those, see `plan/learning-hardware.md`'s hardware tiers (a rented GPU/fabric slot,
an acceptance-test window, or a production on-call rotation) and H12's Mokka-based mock-IB tooling,
for a complementary (also-simulated, differently scoped) angle on single-node HCA inventory.
