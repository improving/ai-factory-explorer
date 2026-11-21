# H07 — NVIDIA GPU Operator

**Why:** this lab runs the real GPU Operator against Mokka.
The device plugin, GPU Feature Discovery, DCGM,
and the validator all come up and behave as they would on a node with hardware.
`plan/learning-hardware.md` maps this module to M9's "deliver, break, repair the GPU Operator" lab.

**Cluster:** dedicated — `mokka-operator`,
with CDI and the NVIDIA container toolkit configured on the kind node (the operator resolves GPUs through the Container Device Interface).

## Why it needs an overlay

The GPU Operator's job is to install and manage a driver.
Mokka has already provided one.
So the operator must be told to stop at the parts that consume a driver,
rather than install one, and be pointed at where Mokka staged it.
`manifests/gpu-operator-values.yaml` does exactly that.

## Prerequisites

Docker, kind, Helm, kubectl. ~15 minutes, most of it pulling operator images.

## Steps

### 1. Create a cluster with CDI enabled

```bash
kind create cluster --name mokka-operator

NODE=mokka-operator-control-plane

docker exec "$NODE" bash -c '
  apt-get update -qq && apt-get install -y -qq curl gpg
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed "s#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g" \
    > /etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update -qq && apt-get install -y -qq nvidia-container-toolkit
'

docker exec "$NODE" nvidia-ctk runtime configure \
  --runtime=containerd --cdi.enabled --set-as-default
docker exec "$NODE" systemctl restart containerd
```

### 2. Install Mokka

```bash
helm install nvml-mock oci://ghcr.io/nvidia/k8s-test-infra/chart/nvml-mock --version "${MOKKA_VERSION:?see handson/README.md#pinned-versions}" \
  --namespace mokka --create-namespace --set-file gpu.customConfig=../profiles/b300.yaml \
  --wait --timeout 120s
```

### 3. Install the GPU Operator

```bash
helm repo add nvidia https://helm.ngc.nvidia.com/nvidia && helm repo update

helm install gpu-operator nvidia/gpu-operator \
  --version v26.3.3   `# the version the upstream v0.4.0 guide pins; don't float this` \
  --namespace gpu-operator --create-namespace \
  -f manifests/gpu-operator-values.yaml \
  --wait --timeout 600s
```

Pin `--version` in anything you keep.
The values file tracks the operator's chart schema,
and an unpinned install can pick up a release that renames a value.

### 4. Verify

```bash
kubectl -n gpu-operator wait --for=condition=ready pod --all --timeout=300s

kubectl get node "$NODE" -o jsonpath='{.status.allocatable.nvidia\.com/gpu}'
# 8 — the b300 class profile has eight devices

kubectl get node "$NODE" -o json \
  | jq '.metadata.labels | with_entries(select(.key | startswith("nvidia.com")))'
```

The validator pod reaching `Completed` is the meaningful signal.
It probes the driver root, exercises CDI injection, and checks that the node advertises GPUs.

## What each value is doing (in `manifests/gpu-operator-values.yaml`)

| Value | Why |
|---|---|
| `driver.enabled: false` | Mokka is the driver; the real DaemonSet would try to build a kernel module |
| `toolkit.enabled: false` | Mokka's DaemonSet already stages the mock libraries on the host; CDI carries the devices instead |
| `cdi.enabled` / `cdi.default` | The runtime reads `/var/run/cdi/nvidia.yaml`, which Mokka generates; this is what replaces the toolkit operand |
| `dcgm.enabled: false` | The separate `nv-hostengine` DaemonSet is redundant, because `dcgm-exporter` embeds the host engine in-process |
| `dcgmExporter.enabled: true` | Kept on deliberately; it reads the mock through `libdcgm`, which is part of what this proves |
| `GFD_MACHINE_TYPE_FILE` | GFD's default reads `/sys/class/dmi/id/product_name`, which says `kind` here, not a real machine type |

## Troubleshooting

This ties directly into [H03, Drill 2](../03-troubleshooting/README.md#drill-2--the-device-plugin-reports-0-gpus) (driver/toolkit not disabled) and the "GPU Operator validator crash-loops" case.
The validator is a statically linked Go binary with no shell.
So a missing file in the staged tree looks like a crash loop, not an error message:

```bash
docker exec "$NODE" ls -la /run/nvidia/driver/usr/lib64/libnvidia-ml.so*
docker exec "$NODE" cat /var/lib/nvml-mock/driver/config/config.yaml
```

## Clean up

```bash
helm uninstall gpu-operator -n gpu-operator
helm uninstall nvml-mock -n mokka
kind delete cluster --name mokka-operator
```

## Self-check

- Why is `dcgm.enabled: false` correct here even though `dcgmExporter.enabled: true`?
- What real-world driver behavior is explicitly **not** exercised by this module?

Check your answers in [the Self-check answers](../self-check-answers.md#h07).

Next: [H08 — Failure Injection demo](../08-failure-injection/README.md)
