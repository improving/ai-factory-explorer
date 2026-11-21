# H06 — NVIDIA DRA Driver

**Why:** DRA is how Kubernetes is moving beyond `nvidia.com/gpu` counters.
A driver publishes **ResourceSlices** that describe the devices on each node.
A workload asks for what it needs through a **ResourceClaim**.
Mokka lets you exercise that path without hardware.

**Cluster:** dedicated — `mokka-dra` (needs the `DynamicResourceAllocation` feature gate and the `resource.k8s.io/v1beta1` API;
neither is on by default).

## Prerequisites

Docker, kind, Helm, kubectl, `jq`. ~10 minutes.

## Steps

### 1. Create a cluster with DRA enabled

```bash
kind create cluster --name mokka-dra --config manifests/kind-dra.yaml
```

### 2. Install Mokka

```bash
helm install nvml-mock oci://ghcr.io/nvidia/k8s-test-infra/chart/nvml-mock --version "${MOKKA_VERSION:?see handson/README.md#pinned-versions}" \
  --namespace mokka --create-namespace --set-file gpu.customConfig=../profiles/b300.yaml \
  --wait --timeout 120s
```

### 3. Install the DRA driver

The kubelet plugin's node affinity requires a GPU-presence label.
Node Feature Discovery would normally derive this label from the feature file that Mokka writes (H04).
This cluster has no NFD, so set the label by hand:

```bash
kubectl label node --all nvidia.com/gpu.present=true

helm repo add nvidia https://helm.ngc.nvidia.com/nvidia && helm repo update

helm install nvidia-dra-driver nvidia/dra-driver-nvidia-gpu \
  --version 0.5.0 \
  --namespace nvidia --create-namespace \
  --set nvidiaDriverRoot=/var/lib/nvml-mock/driver \
  --set gpuResourcesEnabledOverride=true \
  --set resources.computeDomains.enabled=false \
  --wait --timeout 180s
```

| Setting | Why |
|---|---|
| `nvidiaDriverRoot` | Points the driver at Mokka's staged tree instead of a real driver root |
| `gpuResourcesEnabledOverride` | Without this, the driver gates GPU resource publishing on checks that a mock node does not satisfy |
| `resources.computeDomains.enabled=false` | ComputeDomain support needs an NVLink fabric; see [H10](../10-advanced-guides/compute-domain.md) for that path |

### 4. Check the ResourceSlices

```bash
kubectl -n nvidia wait --for=condition=ready pod --all --timeout=120s

kubectl get resourceslices -o json | jq '[.items[].spec.devices // [] | length] | add // 0'
# 8 — the b300 class profile has eight devices
```

### 5. Schedule a pod that claims a GPU

```bash
kubectl apply -f manifests/gpu-claim-pod.yaml
kubectl wait --for=condition=ready pod/gpu-test-pod --timeout=120s
kubectl get resourceclaims
```

The pod reaching `Running` means two things.
The scheduler matched the claim to a published device,
**and** the kubelet plugin's `NodePrepareResources` succeeded.
That second step is the one that would touch real hardware.

## Troubleshooting

- **No ResourceSlices appear:** the driver's kubelet plugin is not scheduled.
  Most often, `nvidia.com/gpu.present=true` is missing from the nodes.
- **The pod stays `Pending`:** run `kubectl describe pod/gpu-test-pod`.
  An unschedulable claim names the device class it could not satisfy.
  Check that it matches `kubectl get deviceclasses`.
- **The API rejects the manifest:** `resource.k8s.io/v1beta1` is not served.
  The `runtime-config` line in `manifests/kind-dra.yaml` takes effect only at cluster **creation**.
  You cannot add it to an existing cluster.

## Clean up

```bash
kind delete cluster --name mokka-dra
```

## Self-check

- What two things does a pod reaching `Running` here prove, beyond "a GPU exists"?
- Why is `gpuResourcesEnabledOverride=true` needed against Mokka but not against real hardware?

Check your answers in [the Self-check answers](../self-check-answers.md#h06).

Next: [H07 — NVIDIA GPU Operator](../07-gpu-operator/README.md)
