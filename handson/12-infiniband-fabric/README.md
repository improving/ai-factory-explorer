# H12 — InfiniBand fabric tooling (HCAs, discovery, cross-node `ibping`)

**Why:** Mokka does not simulate GPUs only.
The `ib` node-daemon simulator (CONCEPTS.md §5) stages a fake InfiniBand HCA sysfs tree,
IB shims, and a `mock-ib` daemon that serves UMAD/verbs, so real IB tooling runs unmodified.
This is the T0 way to practice the discovery and inventory commands you would use before ever touching `ibdiagnet` or real hardware.

**Concepts:** [CONCEPTS.md §3](../CONCEPTS.md#3-two-delivery-mechanisms--and-the-debugging-rule-that-follows-from-them) (same `LD_PRELOAD` interception mechanism as the PCI shim in H04,
applied to `libibmockumad`/ `libibmockverbs`/`libibmocksys`) and the new [§8](../CONCEPTS.md#8-out-of-scope-cuda-nccl-and-the-real-rdmanvlink-data-path) (what this cannot prove).

## Every command below was verified live, including what does not work

Some IB tools need more than one node to do anything meaningful (subnet discovery, cross-node ping).
Others failed even with multiple nodes.
Both cases are called out explicitly, rather than glossed over.

## Part A — single-node HCA discovery (works on H00's cluster, no extra setup)

```bash
POD=$(kubectl -n mokka get pod -l app.kubernetes.io/name=nvml-mock -o jsonpath='{.items[0].metadata.name}')

kubectl -n mokka exec "$POD" -- ibstat
kubectl -n mokka exec "$POD" -- ibv_devices
```

`ibstat` lists each mock HCA (`mlx5_0`..`mlx5_7`,
one ConnectX-8 per GPU on the `b300` profile) with its firmware version,
GUIDs, link state (`Active`/`LinkUp`), and rate (800 Gb/s); all declared, none measured.
`ibv_devices` lists the same HCAs by node GUID,
confirming that the verbs-level device enumeration (`libibmockverbs.so.1`) agrees with the sysfs-level one (`ibstat`,
through `libibmocksys.so.1`).

**Known gap, verified:** `ibv_devinfo` fails here (`Failed to open device`),
on both a single-node and a multi-node cluster (Part B).
The verbs shim answers device listing calls, but not the device open verb.
Do not spend time debugging this as if it were a misconfiguration on your end.
It is a current limitation of the shim, not something H05-H12's setup steps can fix.

## Part B — multi-node fabric discovery (needs 2+ nodes)

`ibnetdiscover` and `iblinkinfo` walk the subnet by exchanging SMPs (subnet management packets) with every port on the fabric.
On a single-node cluster there is no peer to discover,
and both commands crash outright (`umad_recv failed`,
`double free or corruption`) rather than reporting "1 node, no links."
**This is not a bug to work around;
it is the tool doing what it does on real hardware with no cable plugged in**,
but with a worse error message than a real HCA would give.

Stand up a multi-node cluster (reusing [H02](../02-runtime-control/README.md)'s config):

```bash
kind create cluster --name mokka-ib --config ../02-runtime-control/manifests/kind-multi-node.yaml

helm install nvml-mock oci://ghcr.io/nvidia/k8s-test-infra/chart/nvml-mock --version "${MOKKA_VERSION:?see handson/README.md#pinned-versions}" \
  --namespace mokka --create-namespace --set-file gpu.customConfig=../profiles/b300.yaml \
  --wait --timeout 180s

kubectl get pods -n mokka -o wide   # 3 pods, one per node
```

Now the fabric-wide tools work:

```bash
PODS=($(kubectl -n mokka get pod -l app.kubernetes.io/name=nvml-mock -o jsonpath='{.items[*].metadata.name}'))

kubectl -n mokka exec "${PODS[0]}" -- ibnetdiscover
kubectl -n mokka exec "${PODS[0]}" -- iblinkinfo
```

`ibnetdiscover` prints a topology file that names each mock HCA's node GUID and its peer connection (`4xQDR`,
a declared link width and speed).
`iblinkinfo` shows the same links from the "which port talks to which port" angle.
This is the fabric-inventory half of what a real `ibdiagnet` run would confirm against physical cabling.

## Part C — cross-node `ibping` (the one real network protocol in this module)

Unlike everything else in this module,
`ibping` sends actual UMAD packets over the **pod network** between two mock HCAs on different nodes.
H00's cluster overview output already showed you the plumbing for this (`service/nvml-mock-ibping ClusterIP None ... 18515/TCP`),
a headless Service that exists only to let `ibping` find a peer across nodes.

```bash
POD0="${PODS[0]}"
POD1="${PODS[1]}"

# start a server on POD1
kubectl -n mokka exec "$POD1" -- sh -c 'timeout 8 ibping -S -C mlx5_0 -P 1 &'

# find its LID
POD1_LID=$(kubectl -n mokka exec "$POD1" -- ibstat mlx5_0 | grep "Base lid" | awk '{print $3}')
echo "POD1 lid: $POD1_LID"

# ping it from POD0
kubectl -n mokka exec "$POD0" -- timeout 5 ibping -c 3 -C mlx5_0 -P 1 -L "$POD1_LID"
```

Expect 3 `Pong from ... (Lid ...)` lines with real, small round-trip times.
This crossed the pod network, unlike everything upstream of it in this module,
which only crossed a config file.

## Clean up

```bash
kind delete cluster --name mokka-ib
```

## What this does not prove

See [CONCEPTS.md §8](../CONCEPTS.md#8-out-of-scope-cuda-nccl-and-the-real-rdmanvlink-data-path):
no IB switch, no subnet-manager election, no switch NOS or firmware,
no adaptive routing, no congestion or QoS, no real RDMA data transfer,
and no bandwidth or latency numbers worth trusting.
`ibping`'s round-trip time here measures a UMAD packet crossing a kind pod network,
not an HCA crossing a wire.
The fabric this module discovers is also a **full mesh** by construction (every mock HCA can reach every other one),
so do not use it to practice fat-tree or dragonfly port-mapping.
`plan/learning-hardware.md` already notes this, and points to `ibsim` (T1) for that specific lab.

## Self-check

- `ibv_devices` and `ibstat` both succeed, but `ibv_devinfo` fails on every cluster shape you tried.
  What does that tell you about where the verbs shim's coverage stops?
- Why did `ibnetdiscover` crash instead of printing "no other nodes found" on the single-node cluster?
- Which part of this whole module involved real network traffic,
  and which parts were entirely local config reads?

Check your answers in [the Self-check answers](../self-check-answers.md#h12).
