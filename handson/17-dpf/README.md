# H17 — DPF: the DPU as a Kubernetes object

**Why:** the DPU is a server with an Arm CPU, its own OS, and its own services.
When it is not a Kubernetes object, every platform team writes its own scripts.
This lab reads the objects that replace those scripts, and it draws the boundary with NICo.
It needs no DPU: the objects stay pending, and that is the lesson.

**Serves:** M9 (the DPU block), M10 (the Day 0 DPU step).
**Cluster:** new `kind` cluster; the DPF operator; no BlueField.
**Time:** 45 minutes, mostly reading.

## Concepts

- **Three systems.** Provisioning (the DPU hardware and its control plane), services (what runs on the DPU), and service chains (the order of the traffic).
- **The objects.** `DPUCluster`, `DPUNode`, `DPUSet`, `DPUDiscovery`, `DPUFlavor`, and `DPUFlavorTemplate` for provisioning.
  `DPUService`, `DPUServiceInterface`, `DPUServiceIPAM`, `DPUServiceNAD`, and `DPUServiceChain` for services.
- **Two trust modes.** Zero-trust: the host is untrusted, the DPU is managed over its BMC, and the host sees a NIC.
  Host-trusted: the host manages the DPU, which is simpler and weaker.
- **The boundary.** DPF provisions the DPU and its services; NICo sequences the host and the tenant; the GPU Operator and the Network Operator work above both.
  None of them configures a leaf switch.

## Prerequisites

| Requirement | Check |
|---|---|
| `docker`, `kind`, `helm`, `kubectl` | `kind version`, `helm version` |
| Network access to the NGC Helm repository | `helm repo add` succeeds |
| A BlueField-3 DPU | **not required** for this lab |

```bash
export DPF_VERSION=v26.8.0   # keep in step with handson/README.md
```

## Part A — install the operator

```bash
kind create cluster --name dpf-lab

helm repo add --force-update dpf-repository https://helm.ngc.nvidia.com/nvidia/doca
helm repo update

helm upgrade --install -n dpf-operator-system dpf-operator \
  dpf-repository/dpf-operator --version "$DPF_VERSION" \
  --create-namespace --wait
```

**Expected:** the operator pods run.
Read the [Helm prerequisites](https://github.com/NVIDIA/doca-platform/blob/public-main/docs/public/getting-started/helm-prerequisites.md) first if the install asks for a dependency.

```bash
kubectl -n dpf-operator-system get pods
```

## Part B — read the objects

```bash
kubectl api-resources | grep -i dpu
```

**Expected:** the provisioning and service objects from the Concepts section.
Write one line for each object: what it owns, and who creates it.

Read the schema of one object.

```bash
kubectl explain dpuset.spec
kubectl explain dpuflavor.spec
kubectl explain dpuservice.spec
```

Then find the examples in the operator chart or the repository, and read one `DPUFlavor`.
The flavor is the contract between the operator and the hardware: the DPU model, the ports, and the services.

## Part C — create an object with no DPU

Create a `DPUSet` that selects a BlueField-3 flavor.
There is no DPU, so nothing reconciles.

```yaml
# dpuset.yaml
apiVersion: provisioning.dpu.nvidia.com/v1alpha1
kind: DPUSet
metadata:
  name: lab-dpuset
  namespace: dpf-operator-system
spec:
  dpuNodeSelector:
    matchLabels:
      kubernetes.io/hostname: no-such-node
  strategy:
    type: RollingUpdate
  dpuTemplate:
    spec:
      dpuFlavor: passthrough
      bfb:
        name: lab-bfb
```

```bash
kubectl apply -f dpuset.yaml
kubectl -n dpf-operator-system get dpuset lab-dpuset -o yaml | tail -20
kubectl -n dpf-operator-system get dpu -o wide
```

**Expected:** the `DPUSet` exists, and no `DPU` or `DPUNode` is created.
This is the correct result: the controller has no hardware to act on.

**What this teaches:** the object model is decoupled from the hardware.
On a real site, the same object creates the DPU OS install, the HBN configuration, and the firmware state.

## Part D — map the objects to the runbook

Take [RB-06](../../runbooks/RB-06-bluefield-dpu-boot-mlx5-eswitch.md) and answer, for each step of its section 3:

| RB-06 question | The DPF object that owns the answer |
|---|---|
| Which DPU OS and version? | |
| Which HBN or Cumulus configuration? | |
| Which DPU firmware (BMC, NIC, UEFI, ATF)? | |
| Which services run on the DPU? | |
| Which traffic order applies? | |

If an answer has no object, write it as a gap.
Not every DPU question is a provisioning question.

## Part E — draw the boundary

Write one paragraph for each pair, and say who owns the failure:

1. DPF and NICo.
2. NICo and the Network Operator.
3. The GPU Operator and the DPU.
4. DPF and the leaf switch.

The answer for the switch is the same in every case: no platform component configures it.

## Option B — walk through it without a cluster

Read [the system overview](https://github.com/NVIDIA/doca-platform/blob/public-main/docs/public/developer-guides/architecture/system-overview.md) and [Zero Trust](https://github.com/NVIDIA/doca-platform/blob/public-main/docs/public/getting-started/dpf-zero-trust.md), then do Part D and Part E from the pages.

## Troubleshooting

| Symptom | Cause | Check |
|---|---|---|
| The Helm install asks for a dependency | The Helm prerequisites are not installed | the prerequisites guide |
| No CRDs after the install | The chart version does not match the operator image | `helm -n dpf-operator-system list`, `kubectl get crd | grep dpu` |
| The `DPUSet` reports an error | The selector matches nothing, or the flavor is missing | `kubectl -n dpf-operator-system describe dpuset lab-dpuset` |

## Cleanup

```bash
helm uninstall dpf-operator -n dpf-operator-system
kind delete cluster --name dpf-lab
```

## Self-check

A DPU does not boot, and the host sees no NIC.
Which three objects do you read, in order, and which one tells you whether the DPU OS or the host-side PCIe device is the cause?
(`DPUSet` for the desired state, `DPUNode` for the discovered hardware and its state, and the `DPU` or `DPUFlavor` for the image and firmware contract. The `DPUNode` state separates "the DPU did not appear" from "the DPU appeared and the install failed"; the host-side PCIe device is a host question, and it is in RB-06.)
