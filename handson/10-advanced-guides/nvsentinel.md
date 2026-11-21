# H10b — NVSentinel (detect → remediate → auto-recover)

**Why:** this is the fullest SRE-shaped loop in this training.
NVSentinel detects a GPU thermal fault, remediates it (cordon + drain),
and auto-recovers (uncordon) once the GPU cools, all on a laptop, with no physical GPUs.
It maps to `plan/learning-hardware.md`'s "M10 — automatic remediation" lab,
and is the most illustrative demo in this whole session for on-call-style reasoning.

## Concepts

```
nvml-mock (fake libnvidia-ml.so)
   │  GPU pinned hot → T.Limit margin (DCGM field 153) goes negative
   │  slowdown offset (NVML field 194) → metadata-collector → gpu_metadata.json
   ▼
GPU Operator standalone DCGM (nv-hostengine :5555)
   ▼
NVSentinel GPU Health Monitor  ──►  platform-connector  ──►  MongoDB (change streams)
   (GpuThermalMarginWatch)                                    │
                                          fault-quarantine ◄──┘  (cordon)
                                                  │
                                          node-drainer            (drain → workload reschedules)
```

- **Live gauge vs. latched fault** — DCGM field 153 (thermal margin) is a live gauge.
  The very next health-monitor poll after cooldown sees a healthy margin,
  and `fault-quarantine` **uncordons with no DCGM restart**.
  Contrast this with a latched XID/ECC fault (H02/H08),
  which stays latched until the hostengine restarts.
  The distinction between "which faults self-heal on read" and "which faults need a restart" is exactly the kind of judgment call this training is building.
- The fault is driven by the same `nvml-mock-ctl temp`/`reset` commands you already used in H02.
  This demo wires H02 into a real health-monitoring product; it is not new mechanics.

## Option A — run it live

**Resource and tooling requirements** (the heaviest module in this whole session):

| Requirement | Detail |
|---|---|
| `docker`, `kind`, `helm` 3.8+, `kubectl`, `jq` (optional) | |
| Network access | `ghcr.io` (NVSentinel chart), `helm.ngc.nvidia.com` (GPU Operator), `docker.io` (Percona images), `nvidia.github.io` (toolkit packages) |
| Cluster | its own dedicated cluster: 1 control-plane + 2 workers, `nvml-mock-nvsentinel` |
| Stack installed | GPU Operator (standalone DCGM), cert-manager, NVSentinel (MongoDB via the Percona operator, not Bitnami; this is what makes it work on Apple Silicon) |
| Time | about 30 minutes, longer on a cold cache |
| **Machine guidance from this repo's own hardware plan** | test it on a 16 GB laptop before running it in a class; it runs the GPU Operator, cert-manager, and a MongoDB deployment at the same time on kind, which is more RAM and CPU pressure than any earlier module in this session |

```bash
git clone --branch v0.4.0 https://github.com/NVIDIA/k8s-test-infra.git ~/mokka-src   # if needed
~/mokka-src/docs/guides/nv-sentinel/run.sh
```

This is idempotent: it reuses the cluster; set `FORCE_RECREATE=true` to rebuild.
Useful overrides: `GPU_PROFILE`, `HOT_TEMP_C`, `TARGET_GPU`,
`NVSENTINEL_VERSION`, `GPU_OPERATOR_VERSION`, `CERT_MANAGER_VERSION`.

**What it does:** it creates the cluster (CDI enabled),
installs Mokka on both workers,
installs the GPU Operator with driver/toolkit disabled and standalone DCGM enabled,
installs cert-manager, and installs NVSentinel (Percona MongoDB, `metadata-collector` enabled).
It then deploys a sample workload requesting `nvidia.com/gpu: 1`.
**Phase 1** pins one worker's GPU hot (`HOT_TEMP_C`, default 142°C),
waits for cordon and drain, and watches the workload reschedule to the healthy worker.
**Phase 2** clears the override and waits for auto-uncordon.

**The fault, manually** (what the script does, spelled out):

```bash
MOCK=$(kubectl --context kind-nvml-mock-nvsentinel -n mokka \
  get pod -l app.kubernetes.io/name=nvml-mock -o jsonpath='{.items[0].metadata.name}')

# heat it — 142°C is above gb300's 90°C slowdown threshold (87°C on h100)
kubectl --context kind-nvml-mock-nvsentinel -n mokka exec "$MOCK" -- \
  nvml-mock-ctl temp --gpu 0 142

# ... watch NVSentinel cordon + drain the node ...

# cool it
kubectl --context kind-nvml-mock-nvsentinel -n mokka exec "$MOCK" -- \
  nvml-mock-ctl reset --gpu 0

# ... watch it auto-uncordon, no DCGM restart ...
```

The comparison is **strict**: pinning exactly at the threshold leaves a margin of 0°C,
and the watch stays healthy.
You must clear the threshold, not only meet it.

**Expected result:** a node condition like `GpuThermalMarginWatch=True: GPU 0 thermal margin -3°C below HW slowdown T.Limit (slowdown=0°C)` appears.
The node cordons and drains, the sample workload reschedules to the other worker,
and after `reset` the node uncordons on its own within one health-monitor poll interval.

**Clean up:** run `kind delete cluster --name nvml-mock-nvsentinel` (the script also supports a documented cleanup path; check its output).

## Option B — guided conceptual walkthrough (no cluster)

If Option A's about 30 minutes and 3-service stack (GPU Operator + cert-manager + MongoDB) does not fit right now,
walk the flow from the diagram above and answer these questions:

1. Where does the thermal-margin threshold (the "slowdown offset") come from,
   and why is it read only once?
   (NVML field 194, read once by the `metadata-collector` DaemonSet into `gpu_metadata.json`.
   Without `metadataCollector.enabled=true`, `GpuThermalMarginWatch` never arms at all.)
2. Why does cooldown recover without a DCGM restart, when a latched XID/ECC fault would not?
   (DCGM field 153 is a live gauge, re-evaluated on every poll.
   Nothing needs to be reset in DCGM itself, only in the mock's config,
   which `nvml-mock-ctl reset` does instantly.)
3. Why is the NVSentinel control plane pinned to the control-plane node rather than a GPU worker?
   (So that draining a GPU worker never evicts the pipeline that is doing the draining.)
4. Trace one event from "GPU pinned hot" to "workload reschedules" through every box in the diagram,
   out loud, without looking at the diagram a second time.

**Self-check:** you are on shift,
and a real GPU's thermal-margin alert clears itself 90 seconds after you started investigating,
with no ticket update from anyone.
Is that plausible, and why?
(Yes.
A live-gauge check like this can self-clear the moment the physical,
or in this lab injected, condition passes, exactly like the `reset` step above.
That is a legitimate auto-recovery, not someone silencing the alert.)
