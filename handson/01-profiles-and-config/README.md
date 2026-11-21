# H01 — GPU profiles & configuration

**Why:** the profile is the GPU's *static identity*: model, count, memory, topology.
Everything you do in later modules, such as device plugin counts,
DRA ResourceSlices, and DCGM readings, traces back to this.

**Concepts:** [CONCEPTS.md §4](../CONCEPTS.md#4-the-mock-nvml-library-runs-inside-each-consumer--there-is-no-daemon) (merge order:
base profile `<` runtime override),
and [§5](../CONCEPTS.md#5-the-node-daemon-and-its-simulators) (the daemon reconverges on every profile change).

## Prerequisites

H00's cluster and `nvml-mock` release.

## Steps

1. **List the shipped profiles.**
   Seven profiles ship with the chart: `a100`, `b200`, `gb200`, `gb300` (default),
   `h100`, `l40s`, `t4`.
   The class uses its own `b300` profile from `../profiles/`, set with `gpu.customConfig`.

2. **Switch to A100** using the values file in this folder:

   ```bash
   helm upgrade nvml-mock oci://ghcr.io/nvidia/k8s-test-infra/chart/nvml-mock --version "${MOKKA_VERSION:?see handson/README.md#pinned-versions}" \
     --namespace mokka \
     -f values/a100.yaml \
     --wait --timeout 120s

   kubectl exec -n mokka ds/nvml-mock -- nvidia-smi -L
   ```

   Expect 8 `NVIDIA A100-SXM4-40GB` devices: the same count as the class profile `b300`,
   but a different GPU.

3. **Switch to T4** (smallest profile — useful later for fast CI-style jobs):

   ```bash
   helm upgrade nvml-mock oci://ghcr.io/nvidia/k8s-test-infra/chart/nvml-mock --version "${MOKKA_VERSION:?see handson/README.md#pinned-versions}" \
     --namespace mokka \
     -f values/t4.yaml \
     --wait --timeout 120s

   kubectl exec -n mokka ds/nvml-mock -- nvidia-smi -L
   kubectl exec -n mokka ds/nvml-mock -- nvidia-smi --query-gpu=name,memory.total --format=csv
   ```

4. **Read `values/custom-device-overrides.yaml`** side by side with this checklist.
   It is a reference artifact that shows the three sections of a full Mokka config,
   and their precedence:
   - `system:` driver, NVML, and CUDA version strings reported cluster-wide.
   - `device_defaults:` applied to every device, unless overridden.
   - `devices[]:` per-device overrides, matched by `index`.
     **These win over `device_defaults`**.
   - Runtime overrides (H02) win over both.
     They are the only one of the three that does not need a `helm upgrade` or pod restart to take effect.

5. **Restore `b300`** (the class profile) before moving on,
   so later modules match their documented output:

   ```bash
   helm upgrade nvml-mock oci://ghcr.io/nvidia/k8s-test-infra/chart/nvml-mock --version "${MOKKA_VERSION:?see handson/README.md#pinned-versions}" \
     --namespace mokka --reuse-values --set-file gpu.customConfig=../profiles/b300.yaml \
     --wait --timeout 120s
   ```

## Expected result

`nvidia-smi -L` device count and model name change immediately after each `helm upgrade --wait` completes.
You do not need a pod restart to *observe* the change,
because the upgrade itself recreates the DaemonSet pod.
This differs from a **runtime** override in H02,
where the answer of the same running pod changes, and no Kubernetes object changes at all.

## Self-check

- Which of `name`, `architecture`, `uuid`,
  `memory.used_bytes` can `nvml-mock-ctl` change without a `helm upgrade`?
- A profile sets `device_defaults.memory.total_bytes`,
  and `devices[0]` does not mention memory at all.
  What does device 0 report?

Check your answers in [the Self-check answers](../self-check-answers.md#h01).

Next: [H02 — Runtime control with `nvml-mock-ctl`](../02-runtime-control/README.md)
