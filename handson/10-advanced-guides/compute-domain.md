# H10a — Compute Domain (NVLink fabric identity)

**Why:** this lab proves NVLink fabric identity end-to-end.
It covers cluster-level clique/cluster UUID assignment, delivered through NRI,
with a **real** `nvidia-imex` daemon (in no-GPU mode) forming a live domain over mock GPUs.
It maps to `plan/learning-hardware.md`'s "M9 — IMEX on NVL72" lab.

## Concepts

- **Mock NVML fabric APIs** — `nvmlDeviceGetGpuFabricInfo[V]` returns the cluster UUID,
  clique ID, and registration state that a cluster-level topology ConfigMap assigned to the current node (resolved through the downward-API `NODE_NAME`).
- **Real IMEX, fake GPUs** — the demo workload image fronts the real `nvidia-imex` daemon with `nvidia-imex-shim` (`nvidia-imex` exec's `nvidia-imex.real --nogpu`).
  So IMEX readiness is the **real gRPC peer protocol** over the pod network:
  `nvidia-imex-ctl -q` prints `READY`, `-N -j` reports the domain `UP`,
  and killing a peer daemon degrades the domain.
  None of that is simulated.
- Delivered through [NRI](../CONCEPTS.md#6-nri-two-layers-of-injection-and-one-composition-rule):
  the workload pods carry no mock mounts or mock environment at all.
  The overlay, topology environment, and annotated IMEX channel nodes are all injected ambiently.

## Option A — run it live

**Resource/tooling requirements:**

| Requirement | Detail |
|---|---|
| `docker` 24+ | daemon running; multi-stage builds use the repo's pinned Go base |
| `kind` v0.24+ | provisions a **dedicated 4-worker** cluster (`nvml-mock-compute-domain`) |
| `kubectl` v1.30+ | |
| `helm` v3.13+ | chart install + `helm upgrade --reuse-values` |
| `bash` 3.2+, `jq` | `run.sh` parses `nvidia-imex-ctl -N -j` JSON |
| Time | ~10-20 minutes on a warm image cache |
| Disk/CPU | two local image builds (`nvml-mock:compute-domain`, `...-workload`) plus a 4-node kind cluster — noticeably more than H05-H07's single-node clusters |

```bash
git clone --branch v0.4.0 https://github.com/NVIDIA/k8s-test-infra.git ~/mokka-src   # if needed
~/mokka-src/docs/guides/compute-domain/run.sh
```

The script installs the chart with `gpu.profile=gb200`, `topology.enabled=true`,
a demo topology (workers 1-2 → clique 0, workers 3-4 → clique 1),
`nri.enabled=true`, and `imex.mockChannels.enabled=true`.
It deliberately does **not** pass `--set gpu.count=...`.
That flag only sizes the host-side CDI spec.
The in-pod ConfigMap `check-fabric` reads always reflect the full profile device list,
which is stronger evidence, because every GPU on a node must report the same `cliqueId`/`clusterUuid`.

**Expected result:** `check-fabric` inside a demo workload pod on each of the 4 workers reports the clique/cluster UUID assigned to its own node.
`nvidia-imex-ctl -q` reports `READY`.
Killing one peer IMEX daemon degrades the domain for the others.

**Clean up:** run `kind delete cluster --name nvml-mock-compute-domain`.

## Option B — guided conceptual walkthrough (no cluster)

If Option A's footprint does not fit your machine or time budget,
work through this narrative instead,
and treat it as satisfied once you can explain each step out loud:

1. A cluster-level **topology ConfigMap** declares NVLink domains (cliques) and which Kubernetes nodes belong to which clique.
   The mock NVML library overlays this on top of the per-profile YAML at `LoadConfig()` time.
   So identity comes from two merged sources:
   the device profile (H01) and this cluster-wide topology document.
2. The `nvlink` simulator (H04's simulator table) copies that topology document into the overlay tree that the NRI plugin bind-mounts into workloads.
3. NRI injects `NODE_NAME` and `MOCK_TOPOLOGY_CONFIG` into each eligible container.
   The workload pods never declare any of this themselves (tie this back to CONCEPTS.md §6's "ambient overlay").
4. Inside the workload, the engine's `applyTopologyOverlay()` looks up `NODE_NAME` and rewrites every GPU's `clusterUuid`/`cliqueId`.
   This is why `nvidia-smi -q` and `check-fabric` report per-node fabric identity from what looks like one shared static profile.
5. The demo's `nvidia-imex` is real, running `--nogpu` through a shim.
   So the IMEX peer-readiness check (`nvidia-imex-ctl -q` → `READY`,
   `-N -j` → domain `UP`) is a genuine gRPC handshake over the pod network.
   Killing a peer's daemon is a real failure, not an injected one.
   Contrast this with H02/H08's `nvml-mock-ctl`-injected NVML failures, which are configuration.

**Self-check:** which part of this demo is "real," and which is "simulated"?
(Real: the IMEX gRPC protocol, `nvidia-imex-ctl`, the peer network.
Simulated: GPU identity, fabric UUID, and clique assignment,
delivered through the mock NVML library and the NRI-injected topology overlay.)
