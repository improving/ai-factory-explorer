# H09 — Node-Wide Injection (NRI) demo

**Why:** this lab shows the NRI-based injection path.
An ordinary pod runs `nvidia-smi` with **no** `nvidia.com/gpu` request,
no annotation, and no pod-spec mutation by an admission webhook.
This is where [CONCEPTS.md §6](../CONCEPTS.md#6-nri-two-layers-of-injection-and-one-composition-rule) (the two NRI layers,
and the device-plugin composition rule) becomes hands-on.

**Cluster:** dedicated, its own 4-worker kind cluster with containerd NRI enabled.
The official demo script creates this cluster itself and **ignores your current `KUBECONFIG` context**,
so it cannot touch anything from earlier modules.
A stock kind cluster (like `mokka` from H00) does not expose the NRI socket,
so this cannot run there.

## Prerequisites

Docker (daemon running), kind, a clone of the repository, Helm 3.8+, kubectl.

```bash
git clone --branch v0.4.0 https://github.com/NVIDIA/k8s-test-infra.git ~/mokka-src   # if you don't already have it
```

## Steps

### 1. Run the official demo

```bash
~/mokka-src/docs/guides/node-wide-injection/run.sh   # the script finds its files from its own path
```

Safe to re-run: it reuses the existing kind cluster unless `FORCE_RECREATE=true`,
rebuilds the local image, reloads it, and redeploys the demo workloads.
Useful overrides:

```bash
GPU_PROFILE=t4 GPU_COUNT=4 WITH_COMPUTE_DOMAIN=false ~/mokka-src/docs/guides/node-wide-injection/run.sh   # plain injection, no fabric identity
NVML_MOCK_NAMESPACE=my-mokka ~/mokka-src/docs/guides/node-wide-injection/run.sh
WORKLOAD_NAMESPACE=my-demo ~/mokka-src/docs/guides/node-wide-injection/run.sh
FORCE_RECREATE=true ~/mokka-src/docs/guides/node-wide-injection/run.sh
```

`WORKLOAD_NAMESPACE` must differ from `NVML_MOCK_NAMESPACE` and cannot be `kube-system`.
Both are excluded from NRI injection by default.

### 2. Manual reproduction (optional, on the demo's cluster)

To see the ambient overlay directly, instead of trusting the script's assertions,
deploy the manifest in this folder into the workload namespace that the demo created (default `default`).
Run it from this module folder.
The demo already runs its own `gpu-agent` DaemonSet, so this one is called `gpu-agent-manual`:

```bash
kubectl --context kind-nvml-mock-node-wide-demo apply -f manifests/gpu-agent-daemonset.yaml
kubectl --context kind-nvml-mock-node-wide-demo exec -it ds/gpu-agent-manual -- nvidia-smi -L
```

This pod carries **zero** GPU-related configuration; check the manifest yourself.
If `nvidia-smi` runs and reports GPUs anyway, that result is the NRI overlay layer,
not the device plugin.

### 3. Prove the composition rule (device plugin wins)

If you also deploy [H05](../05-device-plugin/README.md)'s device plugin into this same cluster,
and request `nvidia.com/gpu: 1` from a pod,
the NRI plugin detects the device-plugin-served GPU (a `/dev/nvidia*` path or a CDI device) and **suppresses its own device injection**.
The overlay still applies, so `nvidia-smi` works,
but the pod sees only its allocated subset, not every GPU on the node.

## Trust boundary

The NRI plugin treats the device annotation (`nvml-mock.nvidia.com/devices=true` by default) as **pod-author opt-in** for mounting real host GPU device nodes from the staged overlay.
Run this demo only in trusted workload namespaces,
or add namespaces to `nri.excludedNamespaces` when pod authors should not control that opt-in themselves.

## When injection stops (read this before trusting a "still shows GPUs" pod)

The plugin writes the mock stack into a container's OCI spec **at creation time only**.
An already-running pod keeps whatever it was given,
regardless of what happens to the plugin afterward.

| | Fail-closed | Fail-open |
|---|---|---|
| What the runtime does | Refuses to create the container | Unregisters the timed-out plugin, creates containers without it |
| What you see | Pods stuck `ContainerCreating`/`CreateContainerError` | Pods start normally, with **no** mock GPU stack |

Plan for fail-open: containerd decides it, the plugin cannot prevent it,
and nothing in the workload reports it.
Check the DaemonSet's `/readyz` probe, rather than whether the pod is Running:

```bash
kubectl get pods -n mokka -l app.kubernetes.io/name=nvml-mock-nri
kubectl describe pod -n mokka -l app.kubernetes.io/name=nvml-mock-nri | grep -A3 Readiness
```

## Clean up

```bash
kind delete cluster --name nvml-mock-node-wide-demo
```

## Self-check

- A pod requests `nvidia.com/gpu: 1` on a node running both the device plugin and the NRI plugin.
  Does the NRI plugin still inject devices?
- Your demo pod still prints GPUs correctly an hour after you broke NRI on purpose.
  Does that prove injection is still healthy?

Check your answers in [the Self-check answers](../self-check-answers.md#h09).

Next: [H10 — Advanced guides](../10-advanced-guides/) (Compute Domain, NVSentinel, Run:ai FGO)
