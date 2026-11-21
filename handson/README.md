# Mokka Hands-On Lab Session

This is a self-contained, runnable companion to NVIDIA's [Mokka](https://github.com/NVIDIA/k8s-test-infra) ([docs](https://nvidia.github.io/k8s-test-infra/)),
the GPU simulator that `plan/learning-hardware.md` already lists as the main T0 tool of this training.
That document explains why the training uses Mokka, and which module labs it covers.
This folder explains how.
It gives copy-pasteable commands, the manifests and scripts they need,
and the concept notes that explain why each command works, organized as a sequence of modules.

This folder is self-contained.
It does not assume you have read `plan/learning-hardware.md`.

The units are named H00-H13.
The ibsim labs are named IB01-IB20.
These names do not collide with the curriculum modules M0-M11.
The units are optional pre-work.
The "Serves" column below names the curriculum modules.
Each of those modules links its units in a **Hands-on (T0, optional)** line under its lab.

## Prerequisites (all modules)

| Tool | Why | Check |
|------|-----|-------|
| [Docker](https://docs.docker.com/get-docker/), daemon running | Runs the `kind` nodes | `docker info` |
| [kind](https://kind.sigs.k8s.io/) | Throwaway Kubernetes clusters | `kind version` |
| [Helm](https://helm.sh/docs/intro/install/) 3.8+ | Installs the Mokka chart from an OCI registry | `helm version` |
| [kubectl](https://kubernetes.io/docs/tasks/tools/) | Talks to the clusters | `kubectl version --client` |
| `jq` | Parses JSON in a few steps (05, 06) | `jq --version` |

H08-H10 additionally need a `git clone` of `NVIDIA/k8s-test-infra`,
since their demo `run.sh` scripts run from a checkout rather than a published chart:

```bash
git clone --branch v0.4.0 https://github.com/NVIDIA/k8s-test-infra.git ~/mokka-src
# An existing clone: git -C ~/mokka-src checkout v0.4.0
```

## Pinned versions

The class pins one Mokka version (rule 1 in `plan/learning-hardware.md`).
Set these variables in each shell before you run a module:

```bash
export MOKKA_VERSION=0.4.0                                          # nvml-mock chart and image, release v0.4.0
export MOKKA_NODE_IMAGE=ghcr.io/nvidia/mokka-kind-node:sha-f0dde50  # this image has no release tags
export FGO_VERSION=0.2.1                                            # fake-gpu-operator chart (H10c, H14)
export KAI_VERSION=v0.18.6                                          # KAI Scheduler chart (H14)
export NICO_VERSION=v2.2.2                                          # NICo checkout (H16)
export HEALTH_VALIDATION_VERSION=toolkit/v0.3.1                     # health-validation checkout (H18)
export RUNAI_VERSION=3.0.20                                         # NVIDIA Run:ai checkout (H15, T1)
export TOPOGRAPH_VERSION=v1.0.0                                     # topograph chart (H19)
export DPF_VERSION=v26.8.0                                          # DPF operator chart (H17)
```

The fake-gpu-operator chart is published at `oci://ghcr.io/run-ai/fake-gpu-operator/fake-gpu-operator`.
There is no Helm repository to add.

These files also write the versions as literal values.
Change them together with the variables: `plan/learning-hardware.md`,
`02-runtime-control/manifests/kind-multi-node.yaml`,
`03-troubleshooting/scripts/fix-multiarch-image.sh` (its default image),
the comment in `01-profiles-and-config/values/a100.yaml`,
and `profiles/b300.yaml` (derived from the v0.4.0 profiles).

Mokka has no profile for an HGX B300 node.
The labs install [`profiles/b300.yaml`](profiles/b300.yaml) with `--set-file gpu.customConfig=../profiles/b300.yaml`.
The profile is derived from the upstream v0.4.0 profiles.
It combines the B300 GPU of `gb300` (288 GB,
driver 570) with the 8-GPU HGX layout of `b200` (2 NUMA nodes, one HCA per GPU).
It adds two NVSwitch chips (`NV18`), 1100 W, and ConnectX-8 at 800 Gb/s,
as in [the hardware matrix](../handbook/hardware-matrix.md).
The header of the profile says which values are illustrative.
Derive the profile again from the new upstream profiles when you change the version.

## Checking the labs

`scripts/smoke.sh` runs the key commands of the labs and checks their output:
the links and the pinned versions (`docs`), H00-H03, H11,
and H12 on kind with the `b300` profile (`mokka`), and the ibsim image with labs 10,
18, and 20 (`ibsim`).
It uses its own cluster and container names, and removes them when it stops.
CI runs the script on each pull request that changes `handson/`,
and once a week (`.github/workflows/handson.yml`).

```bash
scripts/smoke.sh          # all three parts, about 3 minutes with warm image caches
scripts/smoke.sh mokka    # one part
```

H05-H10 and H12 Part B are not in the smoke test.
They need extra operators or the upstream demo scripts.

## How to use this

Run each module's commands from that module's folder, for example `cd handson/02-runtime-control`.
The paths in this README are relative to `handson/`.

Work through the modules in order.
Each module says which cluster it needs.
Later modules build on concepts, not cluster state, from earlier modules.
Every module ends with an **Expected result** that you can check before you move on.
Most modules have a **Troubleshooting** section that doubles as a self-test.

`CONCEPTS.md` collects the cross-cutting architecture ideas referenced from every module.
Read it once, up front, or read part of it each time a module links to it.

## Module map

| # | Unit | Serves | Cluster | Time |
|---|------|--------|---------|-----:|
| [H00](00-orientation/README.md) | Orientation — what is already running | M1 | reuses your existing `mokka` cluster (or creates one) | 10 min |
| [H01](01-profiles-and-config/README.md) | GPU profiles & configuration | — (Mokka set-up) | same | 15 min |
| [H02](02-runtime-control/README.md) | Runtime control with `nvml-mock-ctl` | M2, M9, M6, M7, [L1 primer](../handbook/l1-primer.md) | same | 30 min |
| [H03](03-troubleshooting/README.md) | Troubleshooting drills (break it / fix it) | M2, [L1 primer](../handbook/l1-primer.md) | same | 20 min |
| [H04](04-node-daemon-and-shims/README.md) | Node Daemon & Libraries/Shims deep-dive | M1 | same, via `docker exec` | 15 min |
| [H05](05-device-plugin/README.md) | NVIDIA Device Plugin | M9, M10 | new: `mokka-device-plugin` | 15 min |
| [H06](06-dra-driver/README.md) | NVIDIA DRA Driver | M9 | new: `mokka-dra` | 20 min |
| [H07](07-gpu-operator/README.md) | NVIDIA GPU Operator | M9, M11 | new: `mokka-operator` | 30 min |
| [H08](08-failure-injection/README.md) | Failure Injection demo | M2, M7 | reuses `mokka` (or its own) | 20 min |
| [H09](09-node-wide-injection/README.md) | Node-Wide Injection (NRI) demo | M9 | new, 4-worker, its own | 20 min |
| [H10](10-advanced-guides/) | Compute Domain / NVSentinel / Run:ai FGO (Option A live, Option B conceptual) | M9, M10 | new, dedicated per guide | 20 min - 45 min each |
| [H11](11-dcgm-nvlink-fabric/README.md) | DCGM, NVLink/NVSwitch fabric, and NUMA topology | M1, M5, M7 | reuses `mokka` | 25 min |
| [H12](12-infiniband-fabric/README.md) | InfiniBand fabric tooling (HCAs, discovery, cross-node `ibping`) via Mokka's mock-IB shim | M1, M3 | Part A reuses `mokka`; Part B/C: new `mokka-ib` | 20 min |
| [H13](13-ibsim-real-fabric/README.md) | Real InfiniBand fabric simulation with `ibsim` + OpenSM: topology, routing, failure injection, 20 labs | M3, M7 | own Docker container, no Kubernetes cluster needed | 4-6 h across all labs |
| [H14](14-kai-scheduler/README.md) | KAI Scheduler: queues, quota protection, reclaim, topology-aware placement | M9, M5 | new, 2 workers, simulated GPUs | 75 min |
| [H15](15-runai-platform/README.md) | NVIDIA Run:ai: quota, fairshare, semi-preemptible workloads, the MCP tools | M9, M11 | T1: Linux 16 GB or a Podman VM, no GPU | 2-3 h |
| [H16](16-nico-lifecycle/README.md) | NICo: discovery, SKU validation, maintenance, allocation, release, with mock hosts | M10, M7 | new, `kind` + the local NICo stack | 90 min |
| [H18](18-health-validation/README.md) | health-validation: the node verdict, the severities, the threshold override, the Slurm prolog | M2, M10 | laptop with Go; a GPU node is optional | 30 min |
| [H19](19-topograph/README.md) | topograph: discovered topology, Kubernetes labels, Slurm topology, the graph API | M3, M10 | new `kind` cluster; the `test` provider | 45 min |
| [H17](17-dpf/README.md) | DPF: the DPU objects, zero-trust and host-trusted, the boundary with NICo | M9, M10 | new `kind` cluster; no DPU | 45 min |

H00-H09, H11, and H12 end with Self-check questions.
The answers are in [self-check-answers.md](self-check-answers.md).
The answers are folded, so that you try each question first.
H14 to H19 give the expected answer in parentheses, because the answer depends on the site.

**Not covered, on purpose:** CUDA, NCCL, GPUDirect, and any real RDMA,
NVLink, or InfiniBand data path, bandwidth, or latency number.
Mokka simulates what a system reads, never what it executes.
See [CONCEPTS.md §8](CONCEPTS.md#8-out-of-scope-cuda-nccl-and-the-real-rdmanvlink-data-path) for what is out of scope and why.
See the tier system of `plan/learning-hardware.md` for where to get it instead.
H13 (`ibsim`) fills part of that gap for InfiniBand.
It has real switches, real routing, and real Subnet Manager behavior, but still no real data plane.
See its own `CAPABILITIES.md` for the exact boundary.

## Cleanup

`scripts/cleanup-all.sh` deletes every throwaway `kind` cluster that these modules create.
On the shared `mokka` cluster, it only removes the `nvml-mock` release and the H11 test pod,
and it keeps the cluster.
Run the script when you are done, or between modules if disk space is tight:

```bash
scripts/cleanup-all.sh
```

## A note on isolation

H05-H10 and H12 each create their **own** kind cluster, rather than reuse `mokka`.
This mirrors the upstream Mokka guides, and it avoids a documented hazard.
Two Mokka releases on one cluster share the same host paths (`/var/lib/nvml-mock`,
`/var/run/cdi`, `/run/nvidia`).
Because of this, a failure that one release's demo injects becomes visible,
without warning, to the other release's workloads.
**Do not install a second `nvml-mock` release into a cluster that already has one,
in namespace `mokka` or otherwise.**
