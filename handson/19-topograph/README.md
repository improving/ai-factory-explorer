# H19 — topograph: the fabric as discovered

**Why:** the design is a drawing.
The fabric is what the switches and the nodes report today.
This lab discovers a fabric, writes it for two consumers, and compares it with the design.

**Serves:** M3 (the discovery block), M10 (the Slurm block topology).
**Cluster:** new `kind` cluster; the `test` provider replays a topology model.
**Time:** 45 minutes.

## Concepts

- **Three views.** The design (the reference architecture), the intent (the site LLD and port map), and the discovery (what the hardware reports).
  A ticket is often a difference between them.
- **Provider and engine.** A provider reads the fabric: InfiniBand (`ibnetdiscover`), NetQ, DRA, or a cloud provider.
  An engine writes the result for a consumer: Kubernetes labels, Slurm `topology.conf`, NFD, Slinky, or JSON.
- **Tier 0 is the switch closest to the node.** The hierarchy grows outward from there.
- **The consumer decides the shape.** A scheduler that places a job by rack wants rack labels.
  Slurm with `topology/block` wants one block per NVLink domain.
  The same discovery feeds both.

## Prerequisites

| Requirement | Check |
|---|---|
| `docker`, `kind`, `helm` 3.10+ or 4.x, `kubectl` | `kind version`, `helm version` |
| `jq` | `jq --version` |

```bash
export TOPOGRAPH_VERSION=v1.0.0   # keep in step with handson/README.md
```

## Part A — discover, and write Kubernetes labels

```bash
kind create cluster --name topo-lab
helm repo add topograph https://dsx-ai-factory.github.io/topograph
helm repo update

helm install topograph topograph/topograph \
  --version "$TOPOGRAPH_VERSION" \
  --namespace topograph --create-namespace \
  --set provider.name=test \
  --set engine.name=k8s
```

The `test` provider replays a simulation model, so the lab needs no fabric.

```bash
helm test topograph --namespace topograph
kubectl get nodes --show-labels | grep fabric.topograph.run
```

**Expected:** the chart test passes, and the nodes carry `fabric.topograph.run/...` labels.
Read the labels and write the hierarchy that they describe: which tier is which, and which node sits in which domain.

```bash
kubectl get nodes -o json | jq '.items[] | {name: .metadata.name, topology: [.metadata.labels | to_entries[] | select(.key|startswith("fabric.topograph.run"))]}'
```

If no label appears, read the log:

```bash
kubectl logs -n topograph -l app.kubernetes.io/name=topograph
```

## Part B — write Slurm topology for a consumer

Install the Slinky engine, which writes `topology.conf` into a `ConfigMap` for Slurm-on-Kubernetes.

```bash
helm upgrade topograph topograph/topograph -n topograph \
  --set provider.name=test \
  --set engine.name=slinky \
  --set engine.params.topologyConfigmapName=topology-lab \
  --set engine.params.topologyConfigPath=topology.conf

kubectl -n topograph get configmap topology-lab -o yaml
```

**Expected:** a `topology.conf` key with a Slurm topology block.
Read it, and answer:

1. Is this a `tree` or a `block` topology?
2. What is the name of the top-level switch?
3. How many levels are there, and which one maps to a node?

Now switch the engine to `graph` and read the JSON.

```bash
helm upgrade topograph topograph/topograph -n topograph \
  --set provider.name=test --set engine.name=graph
kubectl -n topograph port-forward deploy/topograph 49021:49021 &
curl -s -X POST localhost:49021/v1/generate | jq .
sleep 2
curl -s localhost:49021/v1/topology | jq .
```

**Expected:** a request ID, then one topology document.
This is the same model that fed the labels and the Slurm file.
Stop the port-forward with `kill %1`.

## Part C — compare with the design

Take the port map CSV from the Explorer (M3 lab step 5), or the ibsim port map from H13.
Compare it with the discovered hierarchy.

Write three differences, and classify each one:

| Difference | Design says | Discovery says | Class (documentation, unrecorded change, or fault) |
|---|---|---|---|
| | | | |
| | | | |
| | | | |

A difference is not automatically a fault.
The classification is the work.

## Part D — optional, a real fabric (T3)

On a host that can reach the fabric, run the InfiniBand provider.
It needs `ibnetdiscover` and a privileged pod.

```bash
helm upgrade topograph topograph/topograph -n topograph \
  -f https://raw.githubusercontent.com/dsx-ai-factory/topograph/main/charts/topograph/values.k8s.ib-example.yaml \
  --set provider.name=infiniband-k8s \
  --set engine.name=k8s
```

The example values file sets the privileged pod that `ibnetdiscover` needs.
Read it before you apply it.

On bare metal, install the package on the head node and set `provider: infiniband-bm` and `engine: slurm` in `/etc/topograph/topograph-config.yaml`.
The service writes `topology.conf` for the local Slurm.

**Expected:** the real switch hierarchy, and the real node-to-leaf mapping.
Compare it with the LLD, and record the differences.

## Troubleshooting

| Symptom | Cause | Check |
|---|---|---|
| No labels appear | The engine is not `k8s`, or the provider returned no topology | the topograph log; the `engine.name` value |
| The `ConfigMap` is empty | The engine is not `slinky`, or the name is wrong | `kubectl -n topograph get configmap` |
| `helm test` fails | The API server is not ready | `kubectl -n topograph get pods`, then the log |
| The InfiniBand provider returns nothing | `ibnetdiscover` is missing, or the pod is not privileged | the provider log; the chart values `k8s.ib-example.yaml` |

## Cleanup

```bash
helm uninstall topograph -n topograph
kind delete cluster --name topo-lab
```

## Self-check

A cable is moved from leaf 3 to leaf 4 on one node, and nobody records it.
The design says leaf 3, and the discovery says leaf 4.
The job on that node is slower, and the fabric counters are clean.
What is the cause, what is the evidence, and what do you change?
(The node is on the wrong rail for its NIC, so its traffic crosses a spine. The evidence is the discovery output against the LLD, plus the rail label of the node. You change the cable back or you change the design and the job placement. The counters are clean because nothing is broken; the path is longer.)
