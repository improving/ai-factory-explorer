# H10c — Run:ai Fake GPU Operator (dual node-pool interoperability)

**Why:** most clusters that use a GPU simulator at all use exactly one.
This demo shows two different simulators,
Mokka and Run:ai's [fake-gpu-operator](https://github.com/run-ai/fake-gpu-operator) (FGO),
serving different node pools of the same cluster at once.
This is a realistic shape for a platform team migrating between them,
or running both during an evaluation.

## Concepts

- **Why you might use FGO at all, instead of Mokka everywhere:** FGO gives you `nvidia.com/gpu` scheduling,
  a fake `nvidia-smi`, simulated DCGM metrics, GPU topology, and NUMA topology (`NodeResourceTopology`).
  This is useful for pure Kubernetes-scheduling labs, including the KAI Scheduler lab (H14).
  It does **not** run the real `nvidia-smi` binary, does **not** do fault injection,
  and does **not** run real `dcgm-exporter`.
  `plan/learning-hardware.md` already states the training's default:
  "Mokka is the first choice: it adds fault injection and runs the real `nvidia-smi` and `dcgm-exporter`."
  This demo exists to show the two coexisting, not to argue for switching away from Mokka.
- **The mechanism that makes coexistence possible:** the two simulators select their nodes in different ways.
  Mokka uses the chart's `nodeSelector`, so its DaemonSet runs only on the nodes that the selector names.
  FGO has no chart-level `nodeSelector`: its status-updater watches every node that carries the pool label
  `run.ai/simulated-gpu-node-pool` (the key is configurable), and it labels only those nodes for its device plugin.
  Give each worker its own label, and each simulator stays in its own pool.
- **The chart comes from an OCI registry.** FGO publishes its chart at
  `oci://ghcr.io/run-ai/fake-gpu-operator/fake-gpu-operator`.
  There is no Helm repository to add.

## Option A — run it live

**Resource/tooling requirements:**

| Requirement | Detail |
|---|---|
| `docker`, `kind`, `helm` 3.8+, `kubectl` | |
| Cluster | at least 2 workers — one labelled for Mokka, one labelled for the FGO pool |
| Time | ~10 minutes — this is the lightest of the three H10 guides: no operator stack, no database, only two Helm charts |

```bash
kind create cluster --name mokka-runai-fgo --config - <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
    labels:
      gpu-sim/provider: mokka
  - role: worker
    labels:
      run.ai/simulated-gpu-node-pool: fgo
EOF

# Pool 1: Mokka, scoped to its own worker by the chart's nodeSelector
helm install nvml-mock oci://ghcr.io/nvidia/k8s-test-infra/chart/nvml-mock --version "${MOKKA_VERSION:?see handson/README.md#pinned-versions}" \
  --namespace mokka --create-namespace --set-file gpu.customConfig=../profiles/b300.yaml \
  --set "nodeSelector.gpu-sim/provider=mokka" \
  --wait --timeout 120s

# Pool 2: Run:ai fake-gpu-operator, scoped to its own worker by the pool label
helm install fgo oci://ghcr.io/run-ai/fake-gpu-operator/fake-gpu-operator \
  --version "${FGO_VERSION:?see handson/README.md#pinned-versions}" \
  --namespace fgo --create-namespace \
  --set topology.nodePools.fgo.gpu.backend=fake \
  --set topology.nodePools.fgo.gpu.profile=a100 \
  --wait --timeout 120s
```

The pool name in `topology.nodePools` must be the value of the node label.
Here both are `fgo`.
The profile sets the GPU count and the GPU type of the pool: `a100` is 8 GPUs.

**Expected result:**

```bash
kubectl get nodes -L gpu-sim/provider,run.ai/simulated-gpu-node-pool \
  -o custom-columns='NODE:.metadata.name,MOKKA:.metadata.labels.gpu-sim/provider,FGO:.metadata.labels.run\.ai/simulated-gpu-node-pool,GPUS:.status.allocatable.nvidia\.com/gpu'
```

The FGO worker advertises 8 `nvidia.com/gpu`, and the Mokka worker advertises its 8 B300 GPUs.
Both come from two entirely different implementations.
Exec into a pod on each to compare: the Mokka worker runs the real `nvidia-smi` binary,
and the FGO worker runs its own fake one.

**Clean up:** `kind delete cluster --name mokka-runai-fgo`.

## Option A2 — the FGO `mock` backend and NUMA topology

Two FGO features are useful for the platform labs:

- **The `mock` backend.** It puts NVIDIA's `nvml-mock` library on the pool's nodes.
  The real `nvidia-smi`, the upstream device plugin, and the DRA driver then work against simulated GPUs.
  The pool is `mock` instead of `fake`, and a consumer subchart must be enabled.
- **`NodeResourceTopology` (NRT).** NUMA-aware schedulers, including KAI Scheduler, read one NRT per node.
  FGO can publish it without multi-socket hardware.

```yaml
# values-fgo-mock.yaml
topology:
  nodePools:
    fgo:
      gpu:
        backend: mock
        profile: a100
      numa:
        zones: 2
        distances: { self: 10, remote: 21 }
statusUpdater:
  nodeResourceTopology:
    enabled: true
    installCRD: true       # false if NFD or KAI already installed the CRD
gpuOperator:
  enabled: true
gpu-operator:
  toolkit:
    enabled: true
```

```bash
helm upgrade -i fgo oci://ghcr.io/run-ai/fake-gpu-operator/fake-gpu-operator \
  --version "${FGO_VERSION}" -n fgo --create-namespace -f values-fgo-mock.yaml
kubectl get noderesourcetopologies.topology.node.k8s.io
```

Two caveats, from the FGO documentation:

- The `ClusterPolicy` stays `NotReady` on a mock pool.
  The validator init container runs `nvidia-smi` outside the mock library, so it cannot pass.
  This is cosmetic: workloads schedule, and `nvidia-smi` inside a workload pod shows the mock GPUs.
  It is a good second example of a false positive, next to RB-09.
- The published NRT has a static `available` value.
  It does not decrease as pods are scheduled, so a scheduler lab must not depend on it for live capacity.

## Option B — guided conceptual walkthrough (no cluster)

If you would rather not stand this up, the takeaway does not require running it:

1. Two GPU simulators can coexist on one cluster,
   as long as each is scoped to disjoint nodes.
   Mokka scopes by `nodeSelector`; FGO scopes by its node pool label.
   The rule is the same as H05's heterogeneous-fleet stretch goal
   and the "do not co-locate two Mokka releases" warning in H08:
   one simulator for each node, and no shared host path.
2. The decision of which simulator to use per pool is a capability trade-off, not a popularity contest.
   Mokka trades a bit more setup complexity for running the real `nvidia-smi`/`dcgm-exporter` binaries and supporting fault injection.
   FGO trades that fidelity for being lighter weight,
   when a lab needs only `nvidia.com/gpu` scheduling, NUMA topology, or a KAI queue.

**Self-check:** a colleague asks, "why not use FGO everywhere, it is simpler?"
What is your answer, based on this training's own stated priorities?
(FGO cannot do fault injection and does not run the real `nvidia-smi`/`dcgm-exporter`,
both of which this training's M2, M9, M10, M5, and M7 labs rely on, per `plan/learning-hardware.md`.
FGO is the right tool for the scheduling labs, including H14, and for the NUMA topology that KAI reads.)
