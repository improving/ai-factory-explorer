# H00 — Orientation: what is already running

**Why:** before you touch anything, learn to read the state of a Mokka install,
the way you would read any other DaemonSet-based platform component.
This is the basic skill that the rest of the session builds on.

**Concepts:** [CONCEPTS.md §4](../CONCEPTS.md#4-the-mock-nvml-library-runs-inside-each-consumer--there-is-no-daemon) (no daemon,
per-process library) and [§1](../CONCEPTS.md#1-contract-surface-simulation-not-hardware-simulation) (what Mokka does,
and does not, simulate).

## Prerequisites

A kind cluster with the `nvml-mock` chart installed.
First set `MOKKA_VERSION` and `MOKKA_NODE_IMAGE` from [Pinned versions](../README.md#pinned-versions).
If you do not have a cluster yet, run:

```bash
kind create cluster --name mokka --image "${MOKKA_NODE_IMAGE:?see handson/README.md#pinned-versions}"

helm install nvml-mock oci://ghcr.io/nvidia/k8s-test-infra/chart/nvml-mock --version "${MOKKA_VERSION:?see handson/README.md#pinned-versions}" \
  --namespace mokka --create-namespace --set-file gpu.customConfig=../profiles/b300.yaml
```

## Steps

1. **What Helm installed:**

   ```bash
   helm list -n mokka
   ```

   Note the chart version, and whether it uses `latest` or a pinned tag.
   `latest` follows Mokka's main branch.

2. **What is running:**

   ```bash
   kubectl get all -n mokka
   kubectl get pods -n mokka -o wide
   ```

   You should see one `nvml-mock` DaemonSet pod per node (labelled `app.kubernetes.io/name=nvml-mock`),
   and a headless `nvml-mock-ibping` Service.
   [H12](../12-infiniband-fabric/README.md) uses this service for its cross-node `ibping` drill, not this module.

3. **The rendered profile:**

   ```bash
   kubectl get configmap -n mokka -l app.kubernetes.io/name=nvml-mock -o yaml
   ```

   This is the `config.yaml` file that every `nvml-mock` process on the node reads.
   H01 covers its structure in depth.

4. **The real `nvidia-smi`, reading a fake driver:**

   ```bash
   kubectl exec -n mokka ds/nvml-mock -- nvidia-smi -L
   kubectl exec -n mokka ds/nvml-mock -- nvidia-smi -q | head -40
   ```

## Expected result

```
GPU 0: NVIDIA B300 SXM6 AC (UUID: GPU-b3000000-0000-0000-0000-000000000000)
GPU 1: NVIDIA B300 SXM6 AC (UUID: GPU-b3000000-0000-0000-0000-000000000001)
...
GPU 7: NVIDIA B300 SXM6 AC (UUID: GPU-b3000000-0000-0000-0000-000000000007)
```

Eight GPUs, because the class installs the `b300` profile from [`handson/profiles/`](../profiles/b300.yaml).
This profile represents an HGX B300 node like the customer's (see [Pinned versions](../README.md#pinned-versions)).
`nvidia-smi -q` prints the full profile: driver version, memory, PCI identity, and more.

## Self-check

- Is `nvidia-smi` here the real binary, or a Mokka-provided fake?
- You `kubectl exec` into the pod on a *different* node of a multi-node cluster.
  Do you see the same GPU UUIDs?

Check your answers in [the Self-check answers](../self-check-answers.md#h00).

**Note on cluster shape:** the cluster created above is single-node.
A bare `kind create cluster` makes one node that is both control-plane and worker.
This is fine for H00, H01, H03, and H04, which only ever need one `nvml-mock` pod.
[H02's Drill 9](../02-runtime-control/README.md#9-drill-target-the-wrong-node) needs more than one node to be meaningful,
and creates its own throwaway 3-node cluster for that step alone.
You do not need to set that up now.

Next: [H01 — Profiles & configuration](../01-profiles-and-config/README.md)
