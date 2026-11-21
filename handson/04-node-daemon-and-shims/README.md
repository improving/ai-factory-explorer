# H04 — Node Daemon & Libraries/Shims deep-dive

**Why:** the node daemon's simulators put every path there that a consumer reads in H05-H09.
This module inspects the already-running node directly, with no new cluster,
so you can connect each staged file to the simulator or mechanism that produced it.

**Concepts:** [CONCEPTS.md §3](../CONCEPTS.md#3-two-delivery-mechanisms--and-the-debugging-rule-that-follows-from-them) and [§5](../CONCEPTS.md#5-the-node-daemon-and-its-simulators),
and read both before you start.

## Prerequisites

H00's cluster and `nvml-mock` release, still running.

## Steps

### 1. Find the kind node's container

```bash
NODE=$(docker ps --filter name=mokka-control-plane -q)   # adjust the filter to your cluster name
docker exec "$NODE" hostname
```

### 2. `gpudriver` simulator — the driver tree

```bash
docker exec "$NODE" ls -la /run/nvidia/driver/usr/lib64/ | grep libnvidia-ml
docker exec "$NODE" cat /var/lib/nvml-mock/driver/config/config.yaml | head -30
```

`/run/nvidia/driver` is the exact path that the real GPU Operator validator expects.
That is why H07 works unmodified.
`config.yaml` is the same ConfigMap that you inspected in H00/H01,
now visible as a file on the host, not only through `kubectl`.

### 3. `pcibus` simulator — the fake sysfs tree, the shim that serves it, and the NFD feature file

First, look at `/sys/bus/pci/devices` from **the raw kind node**, outside any pod:

```bash
docker exec "$NODE" ls /sys/bus/pci/devices/ | head -5
```

You will see real entries (`0000:00:00.0`, ...): this is the **host's own PCI bus**,
bind-mounted into every container's kernel namespace by Docker/containerd.
It has nothing to do with Mokka.
Remember this: `/sys` always answers with *something*,
so the presence of PCI devices here proves nothing about whether Mokka is working.

Now look at the same path from **inside the `nvml-mock` pod**:

```bash
POD=$(kubectl -n mokka get pod -l app.kubernetes.io/name=nvml-mock -o jsonpath='{.items[0].metadata.name}')
kubectl -n mokka exec "$POD" -- ls /sys/bus/pci/devices/
kubectl -n mokka exec "$POD" -- sh -c 'echo $LD_PRELOAD'
```

This time the entries differ, for example `0000:0a:00.0` and `0000:0b:00.0`, one per mock GPU.
The `$LD_PRELOAD` line shows why: the pod preloads `libpcisysfs.so.1`, alongside the IB shims.
This shim intercepts the libc calls that `ls`/`lspci` make,
and answers from Mokka's **staged tree** on the node, instead of from the kernel's real `/sys`:

```bash
docker exec "$NODE" find /var/lib/nvml-mock -iname '*pci*'
docker exec "$NODE" find /var/lib/nvml-mock/sys/devices -maxdepth 2
```

This is the concrete version of CONCEPTS.md §3's "file-read interception, not library replacement."
It is `LD_PRELOAD` rewriting libc calls.
This works for C tools like `lspci`, but would **not** work for a Go binary like the device plugin,
which makes syscalls directly.
See the self-check below.

Finally, here is the NFD feature file that this tree feeds into Node Feature Discovery:

```bash
docker exec "$NODE" cat /etc/kubernetes/node-feature-discovery/features.d/nvml-mock.features
# pci-10de.present=true
```

(`0x10de` is NVIDIA's PCI vendor ID.
This one line is what lets NFD attach an `nvidia.com/...` label to the node in H07,
without NFD itself knowing anything about Mokka.)

### 4. `cdi` simulator — the CDI specs containerd resolves

```bash
docker exec "$NODE" cat /var/run/cdi/nvidia.yaml 2>/dev/null | head -30
```

H05's `--pass-device-specs=true` and H07's `cdi.enabled=true` both ultimately consume this.

### 5. Kernel module mirror (`lsmod`) — verify before you trust the docs here

The upstream FAQ on `main`, after v0.4.0, states that `lsmod` shows `nvidia`,
`nvidia_uvm`, `nvidia_modeset`, `gdrdrv`, `nvidia_fs`, plus a `/sys/module/nvidia/refcnt` file.
The FAQ of the pinned v0.4.0 says the opposite: kernel module presence is not simulated.
**On the install that this guide was tested against (Docker Desktop/arm64),
none of that is present:**

```bash
docker exec "$NODE" lsmod | grep -E 'nvidia|gdrdrv|mlx5_core'   # empty — lsmod shows the real host's modules
docker exec "$NODE" ls /sys/module/nvidia                       # No such file or directory
POD=$(kubectl -n mokka get pod -l app.kubernetes.io/name=nvml-mock -o jsonpath='{.items[0].metadata.name}')
kubectl -n mokka exec "$POD" -- lsmod                            # exec: "lsmod": executable file not found in $PATH — the pod image is busybox-based
```

This is the same false signal as step 3, and it happens again below.
`lsmod`, `/proc/modules`, and `/sys/module` on the raw node answer with the **host's real modules**,
or, in the pod, are not intercepted at all.
This neither fails loudly, nor proves that Mokka is broken.
It only proves that this particular surface is not staged in this install.
Treat the `main` FAQ's claim as **something to verify when you move to a newer chart version**,
not as something to assume.
Run the check above, and note the actual result, before you rely on it for a lab,
for example a Node Problem Detector rule that keys off `lsmod`.
The one place worth re-checking this is [H07](../07-gpu-operator/README.md),
where the real GPU Operator **validator**, not the plain `nvml-mock` DaemonSet pod,
is the actual consumer that greps for these modules.
If it passes there, the surface exists somewhere that the validator's mounts reach,
even if the bare DaemonSet pod does not show it.

### 6. Tie it back together

| You looked at | Simulator | Mechanism |
|---|---|---|
| `/run/nvidia/driver/...`, `libnvidia-ml.so`, `config.yaml` | `gpudriver` | library replacement |
| the PCI/sysfs tree seen *inside the pod*, NFD feature file | `pcibus` | `LD_PRELOAD` file-read interception (`libpcisysfs.so.1`; the docs' architecture pages also call this shim `libmockfs.so` — same role, do not be thrown by the two names) |
| `/var/run/cdi/nvidia.yaml` | `cdi` | file delivered to containerd |
| `lsmod` output | documented as `gpudriver` (module mirror) | **not reproduced** in this verified install — see step 5 |

Note the one genuine gap that this module surfaces twice, in steps 3 and 5:
`/sys/bus/pci/devices`, `/proc/modules`, and `/sys/module` all looked *fine* from the raw node.
They only answered with the **host's real data**, instead of failing outright or producing an error.
A path that resolves proves nothing by itself.
Always check **from inside the pod or container that you care about**,
and compare against what you would expect a mock to say, not only "did the command succeed."

## Expected result

Steps 1, 2, and 4 show host-level artifacts that the DaemonSet's main container (`node-agent`,
still named that even though the docs call it "Node Daemon") staged directly onto the kind node.
These are visible without any pod-level `kubectl exec`.
Step 3's PCI interception, by contrast,
is only visible **from inside a container that preloads the shim** (`kubectl exec` into the pod).
The node's own view of `/sys` is unmodified.
Step 5 is the module's built-in caution:
do not assume that every doc-stated surface exists on every chart version without checking.
Know how to tell "not staged here" apart from "broken."

## Self-check

- `nvidia-smi` inside the pod is correct,
  but `lspci` inside some *other* container on the same node shows nothing.
  Which component do you suspect first?
- Why can NRI (H09) not use `LD_PRELOAD` the way the PCI shim does,
  for a Go binary like the device plugin?
- You `docker exec` into the kind node, and a path the docs describe (PCI sysfs,
  `lsmod`) looks completely normal.
  Does that confirm Mokka is working?

Check your answers in [the Self-check answers](../self-check-answers.md#h04).

Next: [H05 — NVIDIA Device Plugin](../05-device-plugin/README.md)
