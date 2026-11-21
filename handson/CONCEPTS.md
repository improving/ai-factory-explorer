# Mokka concepts (read once, referenced from every module)

Source: NVIDIA's Mokka docs — [Architecture](https://nvidia.github.io/k8s-test-infra/architecture/),
[Node Daemon](https://nvidia.github.io/k8s-test-infra/components/node-daemon/),
[Libraries and Shims](https://nvidia.github.io/k8s-test-infra/components/libraries-and-shims/),
[NRI Plugin](https://nvidia.github.io/k8s-test-infra/components/nri-plugin/),
[Configuration](https://nvidia.github.io/k8s-test-infra/configuration/),
[FAQ](https://nvidia.github.io/k8s-test-infra/faq/).

## 1. Contract-surface simulation, not hardware simulation

Mokka reproduces the **software contracts** around NVIDIA devices: NVML,
`nvidia-smi`, PCI/sysfs, driver footprints, and InfiniBand tooling.
It does not reproduce the devices themselves.
The docs state the rule plainly:

> Use Mokka when your system **reads** hardware state and reacts to it.
> Use real hardware when it **executes** work, moves data, or measures performance.

This is why Mokka is good for scheduling, alerting, remediation, and fault-injection labs.
It is not useful for anything that needs CUDA, NCCL, real bandwidth or latency, or thermal physics.

## 2. Independent failure and attribution

Real fleets fail one layer at a time.
A GPU can appear in the PCI tree with no driver footprint,
or answer NVML calls but have no NVLink partners.
Mokka's simulators are deliberately independent, one per surface.
This lets you practice "which layer broke," and therefore who owns the remediation,
honestly, instead of as one all-or-nothing failure.

## 3. Two delivery mechanisms — and the debugging rule that follows from them

| A tool asks for | Mokka answers with | Mechanism |
|---|---|---|
| NVML (`nvidia-smi`, DCGM, device plugin, DRA driver) | the mock `libnvidia-ml.so` | **library replacement** |
| PCI sysfs (`lspci`, topology-aware schedulers) | `libmockfs.so` (docs) / `libpcisysfs.so.1` (shipped `LD_PRELOAD` lib) | **file-read interception** |
| InfiniBand (`ibstat`, `ibv_devinfo`, `iblinkinfo`) | `libibmock*` | **file-read interception** |
| the `nvidia-imex` binary | `nvidia-imex-shim` | **exec wrapper** |

NVML is a *library*, so Mokka can replace it wholesale.
Nothing is forwarded anywhere, because there is nothing behind it.
`/sys` and `/dev` belong to the *kernel*, not to Mokka.
Tools that read them get their **file lookups** rewritten to a staged tree at the same paths instead.

**Debugging rule that follows from this:** for wrong `nvidia-smi` output,
check the mock NVML library (profile, override file, TTL).
For wrong `lspci` or `ibstat` output, check a shim: confirm it is preloaded,
and confirm the staged tree exists on this node.

## 4. The mock NVML library runs *inside* each consumer — there is no daemon

Every process that `dlopen`s `libnvidia-ml.so` gets its own copy of the engine and its own device objects.
Two consumers on the same node agree because they read the same **files**,
not because they talk to a shared server.
This single fact explains three things:

- There is no command channel to inform a running process of a change.
- Runtime changes (`nvml-mock-ctl`) are delivered as a **polled override file** with a TTL (default ~1s),
  instead of as a push.
- The override is per-**node** (a host-mounted file), never per-cluster.

Two inputs are merged, in this order: **base profile** (installed through Helm;
changes only on `helm upgrade`) `<` **runtime override `all:` block** `<` **runtime override `devices[i]:` block**.
A few identity and topology fields (`name`, `architecture`, `uuid`,
PCI `bus_id`, `bar1_memory`, and others) are baked in at construction time.
They are **not** hot-reloadable: they need a pod restart or a Helm change.

## 5. The Node Daemon and its simulators

One `node-agent` (still named that in `kubectl`/`values.yaml`,
though the docs call it "Node Daemon") runs on each targeted node.
It continuously reconciles, or "stages," the surfaces that a consumer will later read:

| Simulator | Stages |
|---|---|
| `gpudriver` | device nodes, the mock NVML library, `nvidia-smi`, procfs, the driver tree bind-mounted at `/run/nvidia/driver` |
| `pcibus` | a fake `/sys/bus/pci/devices` tree, the `libmockfs.so` shim, the NFD feature file |
| `cdi` | the two CDI specs containerd uses to inject mock GPUs into containers |
| `imex` | IMEX channel devices, `/proc/devices` overlay, the DRA compute-domain capability file |
| `nvlink` | the ComputeDomain topology document (NVLink fabric identity) |
| `fabricmanager` | a stand-in for `nv-fabricmanager` (NVSwitch registration) |
| `ib` | a fake `/sys/class/infiniband` tree, IB shims, the `mock-ib` UMAD/verbs daemon |
| `kernellog` | announces injected Xids on the node's kernel log |

The daemon is **level-triggered**, not a one-shot installer.
Change the profile (`helm upgrade`), and the daemon reconverges the node onto the new desired state.

## 6. NRI: two layers of injection, and one composition rule

The NRI plugin (`nvml-mock-nri`) puts mock GPUs inside a container that the pod author never touched.
It does this by registering with containerd's **Node Resource Interface** and editing containers as they are created.

| Layer | Applies to | Delivers |
|---|---|---|
| **Overlay** | every non-excluded container, ambient | the mock driver tree + env — enough for `nvidia-smi` to run |
| **Devices** | only opt-in containers (an annotation) | real `/dev/nvidiaN` nodes, or a CDI reference |

**Composition rule (MEP-0002):** whatever the real NVIDIA device plugin already served wins.
The NRI plugin checks for evidence that a container already has device-plugin-allocated GPUs (a `/dev/nvidia*` path,
or a CDI device named `nvidia.com/...`).
If it finds that evidence, it suppresses its own device injection,
but the ambient overlay still applies, so `nvidia-smi` works and reports the allocated subset.
IMEX channel injection is the one exception: it is never suppressed,
because the device plugin never delivers IMEX.

**Fail-open, not fail-closed, in the common case:** a container created before the plugin fails keeps whatever it was given.
Only new containers are affected.
In this situation, containerd usually **unregisters the timed-out plugin and creates containers without it**,
rather than blocking them.
That silent window is why the plugin ships `/readyz` and other probe surfaces,
instead of relying on the state of the pod.

## 7. FAQ facts worth memorizing before you hit them as "bugs"

- `nvidia-smi` always reports **0 MiB used**, on every profile,
  unless you set `allocationWatcher.enabled=true`.
  This is a sidecar that mirrors kubelet pod-resources claims into `memory.used_bytes`/`free_bytes`.
  The value is still synthetic, but it changes with allocation.
- A pod that only requests `nvidia.com/gpu` gets the **device node** and nothing else:
  no `nvidia-smi`, and no `libnvidia-ml.so`.
  Putting the *libraries* into a container is the job of the NRI plugin (or a manual hostPath mount).
  This is a boundary of the plain device-plugin install, not a bug.
- CUDA workloads are **not supported**: there is no kernel driver and no data path, by design.
- `lsmod` shows **no** `nvidia` module at the pinned v0.4.0.
  Kernel module presence is not simulated,
  so `lsmod` shows the host's real modules ([H04, step 5](04-node-daemon-and-shims/README.md#5-kernel-module-mirror-lsmod--verify-before-you-trust-the-docs-here)).
  The FAQ on upstream `main` describes a newer mirror of `nvidia`, `gdrdrv`, and other modules.
  Check it again when you move to a newer version.
- Failure is **configuration**, not a special code path: `nvidia-smi`,
  DCGM, and the device plugin all agree on an injected fault the same way they would agree on a real one.

## 8. Out of scope: CUDA, NCCL, and the real RDMA/NVLink data path

Every hands-on module in this session (00-13) is built on the rule in §1:
Mokka simulates what a system **reads**, never what it **executes**.
That rule has direct, named consequences.
State them here, instead of letting you discover them as a confusing failure mid-lab:

| Not simulated | Why it cannot be | Where to get it instead |
|---|---|---|
| CUDA application execution, kernels, memory access, peer-to-peer | No kernel driver, no GPU, no data path exists to run anything on | T2/T3 real hardware (`plan/learning-hardware.md`) |
| NCCL collectives, GPUDirect, RDMA data transfer | All require a real data path between real devices | T2/T3, or Soft-RoCE (T1) for the verbs API surface only |
| Real NVLink/NVSwitch/InfiniBand **traffic**, bandwidth, latency | Counters are declared, or accrue from elapsed time (see [Metric Fidelity](https://nvidia.github.io/k8s-test-infra/configuration/#metric-fidelity)), never from bytes moved | T3 |
| GPU/HCA/switch driver and firmware install, upgrade, reset | Mokka *is* the driver — there is nothing underneath it to install onto | T2/T3 |
| Switch management planes, CLI, routing, NOS/firmware | No switch ASIC exists in this stack at all | T3, or a real switch's own lab/sandbox |
| MIG partition creation/lifecycle, Confidential Computing | Explicitly unimplemented — see the FAQ's "what is not simulated yet" | T2/T3 |
| Reproducing hardware faults/races with physical timing fidelity | Failure is configuration (see above), not physics | T3, or real incident data |

This is why [H12](12-infiniband-fabric/README.md)'s InfiniBand coverage stops at **discovery and inventory** tooling (`ibstat`,
`ibv_devices`, `ibnetdiscover`, `iblinkinfo`,
and one real UMAD `ibping` round-trip over the pod network),
rather than anything like `ib_write_bw` or real RDMA traffic.
It is also why there is no NCCL or CUDA hands-on module in this session at all.
There is nothing in Mokka for either of them to run against,
and pretending otherwise would teach the wrong mental model.
The tier table (T0-T4) of `plan/learning-hardware.md` is the map of what closes each gap, and at what cost.
