# Self-check answers

These are the answers to the Self-check questions at the end of each module.
Answer each question yourself first.
Then open the answer to check it.

## H00

[H00 — Orientation: what is already running](00-orientation/README.md#self-check)

**Q1.**
Is `nvidia-smi` here the real binary, or a Mokka-provided fake?

<details>
<summary>Answer</summary>

It is the real, unmodified binary.
It loads Mokka's `libnvidia-ml.so` instead of the vendor library.

</details>

**Q2.**
You `kubectl exec` into the pod on a *different* node of a multi-node cluster.
Do you see the same GPU UUIDs?

<details>
<summary>Answer</summary>

No. Each node's daemon builds its own device objects from the same profile,
but UUIDs are generated per node, unless the profile pins explicit ones.

</details>

## H01

[H01 — GPU profiles & configuration](01-profiles-and-config/README.md#self-check)

**Q1.**
Which of `name`, `architecture`, `uuid`,
`memory.used_bytes` can `nvml-mock-ctl` change without a `helm upgrade`?

<details>
<summary>Answer</summary>

Only `memory.used_bytes`.
The rest are identity and topology fields baked in at construction time.
See CONCEPTS.md §4.

</details>

**Q2.**
A profile sets `device_defaults.memory.total_bytes`,
and `devices[0]` does not mention memory at all.
What does device 0 report?

<details>
<summary>Answer</summary>

The `device_defaults` value.
Per-device overrides apply only to the fields that they explicitly set.

</details>

## H02

[H02 — Runtime control with `nvml-mock-ctl`](02-runtime-control/README.md#self-check)

**Q1.**
Why must you run `nvml-mock-ctl` once per node, instead of once per cluster?

<details>
<summary>Answer</summary>

Each node's DaemonSet pod writes a **node-local** override file.
There is no cluster-wide state store or command channel.
See CONCEPTS.md §4.

</details>

**Q2.**
You inject `--mode ecc_uncorrectable` with no `--after-calls`.
When does it trip?

<details>
<summary>Answer</summary>

It trips on the first guarded NVML call after the injection.
Use `--after-calls N` to defer it.

</details>

## H03

[H03 — Troubleshooting drills (break it / fix it)](03-troubleshooting/README.md#self-check)

**Q1.**
For "wrong `nvidia-smi` output" versus "wrong `lspci`/`ibstat` output," where do you look first, and why?

<details>
<summary>Answer</summary>

The difference is this: NVML library, profile, or override, versus a shim or a staged-tree mount.
See CONCEPTS.md §3.

</details>

**Q2.**
Name the one command that tells you whether your profile loaded,
and with how many devices, before you check anything else.

<details>
<summary>Answer</summary>

`MOCK_NVML_DEBUG=1 nvidia-smi`.

</details>

**Q3.**
Why can Mokka not faithfully reproduce Xid 13, 31, or 43?

<details>
<summary>Answer</summary>

These are real-world workload faults, where the GPU keeps running fine.
Mokka's `fail` command has only three modes,
and all three make the device look broken at the NVML level, which does not match that signature.

</details>

## H04

[H04 — Node Daemon & Libraries/Shims deep-dive](04-node-daemon-and-shims/README.md#self-check)

**Q1.**
`nvidia-smi` inside the pod is correct,
but `lspci` inside some *other* container on the same node shows nothing.
Which component do you suspect first?

<details>
<summary>Answer</summary>

Suspect the `pcibus` simulator's `LD_PRELOAD` shim (`libpcisysfs.so.1`/`libmockfs.so`),
and check whether it is preloaded in that container.
Do not suspect the mock NVML library, which is unrelated to PCI sysfs reads.

</details>

**Q2.**
Why can NRI (H09) not use `LD_PRELOAD` the way the PCI shim does,
for a Go binary like the device plugin?

<details>
<summary>Answer</summary>

Go binaries make syscalls directly, and never go through a preloaded library.
See Architecture "Delivery".
This is why file surfaces must be mounted into the container instead.

</details>

**Q3.**
You `docker exec` into the kind node, and a path the docs describe (PCI sysfs,
`lsmod`) looks completely normal.
Does that confirm Mokka is working?

<details>
<summary>Answer</summary>

No. The node's own namespace can answer from the real host or kernel without an error.
A "successful" read from the raw node proves nothing.
Check from inside the actual consumer container, and compare the *content*, not only the exit code.

</details>

## H05

[H05 — NVIDIA Device Plugin](05-device-plugin/README.md#self-check)

**Q1.**
Why does dropping `nodeSelector` in the heterogeneous-fleet stretch goal corrupt both pools,
instead of only failing to schedule?

<details>
<summary>Answer</summary>

Both DaemonSets share the same hostPaths, and would write conflicting per-node state.
See the isolation note of the README and CONCEPTS.md §2.

</details>

## H06

[H06 — NVIDIA DRA Driver](06-dra-driver/README.md#self-check)

**Q1.**
What two things does a pod reaching `Running` here prove, beyond "a GPU exists"?

<details>
<summary>Answer</summary>

It proves that the scheduler matched the ResourceClaim to a published device,
and that `NodePrepareResources` succeeded on the node.

</details>

**Q2.**
Why does Mokka need `gpuResourcesEnabledOverride=true`, when real hardware does not?

<details>
<summary>Answer</summary>

The driver normally gates GPU resource publishing on checks that a mock node does not naturally satisfy.
This is not a bypass of anything that Mokka itself enforces.

</details>

## H07

[H07 — NVIDIA GPU Operator](07-gpu-operator/README.md#self-check)

**Q1.**
Why is `dcgm.enabled: false` correct here, even though `dcgmExporter.enabled: true`?

<details>
<summary>Answer</summary>

`dcgm-exporter` embeds the host engine in-process.
The separate DaemonSet would be redundant, not disabled because it is broken.

</details>

**Q2.**
What real-world driver behavior does this module explicitly **not** exercise?

<details>
<summary>Answer</summary>

The driver install and upgrade path itself.
Mokka never installs a real driver, by design.

</details>

## H08

[H08 — Failure Injection demo](08-failure-injection/README.md#self-check)

**Q1.**
Why does Scenario 2 (`ecc_uncorrectable`) still list every GPU in `nvidia-smi -L`,
while Scenario 3 (`lost`) does not?

<details>
<summary>Answer</summary>

The mode contract explains this:
`ecc_uncorrectable` keeps the device addressable while its counters climb.
`lost`/`fallen_off_bus` make every subsequent guarded call error out.

</details>

**Q2.**
You want to verify an injected Xid programmatically.
Why will grepping `nvidia-smi` output not work?

<details>
<summary>Answer</summary>

The Xid is delivered through the NVML event set, which `nvidia-smi` never reads.
Use `nvmlEventSetWait`, or a consumer that does, like the device plugin's health monitor.

</details>

## H09

[H09 — Node-Wide Injection (NRI) demo](09-node-wide-injection/README.md#self-check)

**Q1.**
A pod requests `nvidia.com/gpu: 1` on a node that runs both the device plugin and the NRI plugin.
Does the NRI plugin still inject devices?

<details>
<summary>Answer</summary>

No. The device plugin already served it,
so device injection is suppressed per MEP-0002 (the composition rule).
The ambient overlay still applies, so `nvidia-smi` works.

</details>

**Q2.**
Your demo pod still prints GPUs correctly, an hour after you broke NRI on purpose.
Does that prove injection is still healthy?

<details>
<summary>Answer</summary>

No. Fail-open means that already-running containers keep what they were given.
Check `/readyz`, not pod status, for the current plugin health.

</details>

## H11

[H11 — DCGM, NVLink/NVSwitch fabric, and NUMA topology](11-dcgm-nvlink-fabric/README.md#self-check)

**Q1.**
You changed a GPU's temperature with `nvml-mock-ctl`,
and read the new value through `dcgmi dmon`, not `nvidia-smi`.
Why did that work with no DCGM-specific configuration?

<details>
<summary>Answer</summary>

DCGM reads through the same mock NVML library as every other consumer.
The override file and TTL from CONCEPTS.md §4 apply to every process that loads `libnvidia-ml.so`, DCGM included.

</details>

**Q2.**
`nvidia-smi topo -m` shows `NV18` between every GPU pair.
Does that mean this cluster tested NVLink bandwidth?

<details>
<summary>Answer</summary>

No. It is the declared `links_per_gpu` value from the profile, rendered as topology.
No traffic crossed any link.

</details>

## H12

[H12 — InfiniBand fabric tooling (HCAs, discovery, cross-node `ibping`)](12-infiniband-fabric/README.md#self-check)

**Q1.**
`ibv_devices` and `ibstat` both succeed, but `ibv_devinfo` fails on every cluster shape you tried.
What does that tell you about where the coverage of the verbs shim stops?

<details>
<summary>Answer</summary>

It answers device *enumeration* calls, but not the *open* verb.
This is a real gap in this shim's implementation, not a setup mistake,
per CONCEPTS.md §3's "implemented vs. stubbed" idea.

</details>

**Q2.**
Why did `ibnetdiscover` crash,
instead of printing "no other nodes found," on the single-node cluster?

<details>
<summary>Answer</summary>

It is a real SMP exchange with no peer to answer it.
This is the same failure mode that a real HCA with no cable would produce,
with a rougher error message.

</details>

**Q3.**
Which part of this whole module involved real network traffic,
and which parts were entirely local config reads?

<details>
<summary>Answer</summary>

Only Part C's `ibping` crossed the pod network.
`ibstat`/`ibv_devices`/ `ibnetdiscover`/`iblinkinfo` all read Mokka's staged tree and the local `mock-ib.sock`.

</details>
