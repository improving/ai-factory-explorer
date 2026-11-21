# H05 — NVIDIA Device Plugin

**Why:** this is the simplest way to make Kubernetes itself believe that a node has GPUs.
The real NVIDIA device plugin runs unmodified.
It discovers devices through NVML, and Mokka is what answers.

**Concepts:** [CONCEPTS.md §3](../CONCEPTS.md#3-two-delivery-mechanisms--and-the-debugging-rule-that-follows-from-them) (the device plugin is an NVML consumer, like `nvidia-smi`).

**Cluster:** dedicated — `mokka-device-plugin`.
Do not reuse the `mokka` cluster from H00-H04 (see [README.md's isolation note](../README.md#a-note-on-isolation)).

## Prerequisites

Docker, kind, Helm, kubectl. ~5 minutes.

## Steps

### 1. Create a cluster and install Mokka

```bash
kind create cluster --name mokka-device-plugin

helm install nvml-mock oci://ghcr.io/nvidia/k8s-test-infra/chart/nvml-mock --version "${MOKKA_VERSION:?see handson/README.md#pinned-versions}" \
  --namespace mokka --create-namespace --set-file gpu.customConfig=../profiles/b300.yaml \
  --wait --timeout 120s
```

### 2. Label the node

The device plugin manifest targets the simulated-GPU node pool:

```bash
kubectl label node --all mokka.nvidia.com/type=sgpu
```

### 3. Deploy the device plugin

```bash
kubectl apply -f manifests/device-plugin-daemonset.yaml

kubectl -n kube-system wait --for=condition=ready \
  pod -l name=nvidia-device-plugin-mock --timeout=120s
```

| Argument | Why |
|---|---|
| `--nvidia-driver-root`, `--driver-root-ctr-path` | Point the plugin at Mokka's staged tree instead of a real driver root |
| `--device-discovery-strategy=nvml` | Discover through NVML, the interface Mokka implements |
| `--pass-device-specs=true` | Deliver device nodes into the container; required if you also run [H09](../09-node-wide-injection/README.md)'s NRI injection, so the two do not both inject |

### 4. Verify allocatable GPUs

```bash
kubectl get nodes -o custom-columns='NODE:.metadata.name,GPUS:.status.allocatable.nvidia\.com/gpu'
# NODE                                GPUS
# mokka-device-plugin-control-plane   8
```

The count comes from the profile.
`b300` (the class profile) has eight devices.

### 5. Schedule a workload

```bash
kubectl apply -f manifests/gpu-pod.yaml
kubectl wait --for=condition=ready pod/gpu-pod --timeout=120s
```

The pod reaching `Running` is the result.
The kubelet accepted a GPU request on a node that has none,
because the plugin allocated one of Mokka's.

### 6. Stretch — different GPU models on different nodes

```bash
kind create cluster --name mokka-fleet --config manifests/kind-fleet.yaml
kubectl label node --all mokka.nvidia.com/type=sgpu

helm install nvml-mock-a100 oci://ghcr.io/nvidia/k8s-test-infra/chart/nvml-mock --version "${MOKKA_VERSION:?see handson/README.md#pinned-versions}" \
  --namespace mokka --create-namespace \
  --set gpu.profile=a100 --set gpu.count=4 \
  --set "nodeSelector.nvml-mock/profile=a100" --wait --timeout 120s

helm install nvml-mock-t4 oci://ghcr.io/nvidia/k8s-test-infra/chart/nvml-mock --version "${MOKKA_VERSION:?see handson/README.md#pinned-versions}" \
  --namespace mokka \
  --set gpu.profile=t4 --set gpu.count=2 \
  --set "nodeSelector.nvml-mock/profile=t4" --wait --timeout 120s

kubectl apply -f manifests/device-plugin-daemonset.yaml   # relabel nodeSelector if needed
kubectl get nodes -l nvml-mock/profile \
  -o custom-columns='NODE:.metadata.name,GPUS:.status.allocatable.nvidia\.com/gpu'
```

**Important:** the chart's hostPath mounts (`/var/lib/nvml-mock`,
`/var/run/cdi`, `/run/nvidia`, the NFD features directory) are the same for every release.
The DaemonSet tolerates every taint by default.
The `nodeSelector` is the only setting that keeps the two pools apart.
Drop it, and both releases land on both workers and overwrite each other's per-node state.

## Node labels

The device plugin advertises the resource,
but it does **not** label the node with `nvidia.com/...` labels.
Those labels come from Node Feature Discovery and GPU Feature Discovery (H07).

## Troubleshooting

**Allocatable stays at zero:** this means the plugin found no devices.

```bash
kubectl -n kube-system logs -l name=nvidia-device-plugin-mock
```

Look for an NVML error, and confirm the driver root is staged (H04, step 2).

## Clean up

```bash
kubectl delete pod gpu-pod --ignore-not-found
helm uninstall nvml-mock -n mokka
kind delete cluster --name mokka-device-plugin
# if you ran the stretch goal:
kind delete cluster --name mokka-fleet
```

## Self-check

- Why does dropping `nodeSelector` in the heterogeneous-fleet stretch goal corrupt both pools rather than only failing to schedule?

Check your answers in [the Self-check answers](../self-check-answers.md#h05).

Next: [H06 — NVIDIA DRA Driver](../06-dra-driver/README.md)
