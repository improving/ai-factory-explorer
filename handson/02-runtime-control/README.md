# H02 — Runtime control with `nvml-mock-ctl`

**Why:** this tool lets you change the simulated GPU health of a running node,
without a Helm upgrade, an image rebuild, or a pod restart.
It is the mechanism behind every failure-injection, thermal, and telemetry lab in this training.

**Concepts:** [CONCEPTS.md §4](../CONCEPTS.md#4-the-mock-nvml-library-runs-inside-each-consumer--there-is-no-daemon) (no daemon,
so a polled override file with a ~1s TTL, per-node scope) is required reading before this module.

## Prerequisites

H00's cluster and `nvml-mock` release.
Restore the `b300` profile if you changed it in H01.

## Steps

### 1. Find your pod

```bash
POD=$(./scripts/find-node-pod.sh)
echo "$POD"
```

`$POD` is a shell variable, not a Kubernetes object.
It exists only in the terminal session where you ran the line above.
If you open a new terminal or tab, or your shell history reruns an old command with `$POD` unset,
run this step again first.
An unset or empty `$POD` fails differently from the errors below:
for example, `Error from server (NotFound): pods "" not found`, or `resource name may not be empty`.
If you see one of those errors, run this step again to fix it.

### 2. `status` — see what is already overridden (should be empty on a fresh install)

```bash
kubectl -n mokka exec "$POD" -- nvml-mock-ctl status
```

### 3. Pin common metrics, and watch them change

```bash
# Temperature (Celsius), power (Watts), utilization (%), clocks (MHz)
kubectl -n mokka exec "$POD" -- nvml-mock-ctl temp --gpu 0 85
kubectl -n mokka exec "$POD" -- nvml-mock-ctl power --gpu 0 300
kubectl -n mokka exec "$POD" -- nvml-mock-ctl util --gpu 0 92
kubectl -n mokka exec "$POD" -- nvml-mock-ctl clocks --gpu 0 1410

kubectl -n mokka exec "$POD" -- nvidia-smi \
  --query-gpu=index,temperature.gpu,power.draw,utilization.gpu,clocks.sm \
  --format=csv
```

If the first read looks stale, run the `nvidia-smi` query again, a few times, about a second apart.
Each consumer process re-polls the override file on a ~1s TTL.

### 4. Inject and clear a failure

```bash
# ECC uncorrectable: device stays addressable, ECC counters climb
kubectl -n mokka exec "$POD" -- nvml-mock-ctl fail --gpu 0 --mode ecc_uncorrectable
kubectl -n mokka exec "$POD" -- nvidia-smi --query-gpu=ecc.errors.uncorrected.aggregate.total --format=csv

# lost / fallen_off_bus: every subsequent guarded NVML call errors out
kubectl -n mokka exec "$POD" -- nvml-mock-ctl fail --gpu 0 --mode lost
kubectl -n mokka exec "$POD" -- nvidia-smi --query-gpu=temperature.gpu --format=csv   # expect an error marker, e.g. [Unknown Error]

# Recover
kubectl -n mokka exec "$POD" -- nvml-mock-ctl fail --gpu 0 --mode healthy
kubectl -n mokka exec "$POD" -- nvidia-smi -L    # back to normal
```

### 5. Inject a fault with an Xid, and see it on the (shared) kernel log

```bash
kubectl -n mokka exec "$POD" -- nvml-mock-ctl fail --gpu 0 --mode ecc_uncorrectable --xid 79
kubectl -n mokka exec "$POD" -- dmesg | grep Xid || true
```

Note the `--` before `dmesg`.
It separates the flags of `kubectl exec` itself from the command to run *inside* the container.
`dmesg` runs remotely, and its output is then piped to your **local** `grep`.
If you retype this by hand and drop the part after `-- `,
you will get `error: you must specify at least one command for the container`.
This message means that `kubectl` has a pod but no command to run in it.
It is not a problem with the pod or the cluster.

**This step requires `nodeAgent.kernelLog.enabled=true` on the chart,
which is off by default** (it needs a privileged pod —
see [CONCEPTS.md §5](../CONCEPTS.md#5-the-node-daemon-and-its-simulators)).
On a default install, the `grep Xid` command above finds nothing, and prints no output.
That is expected, not a failure, and `|| true` keeps the exit code clean either way.
To see the line, install or upgrade the chart with kernel-log support first:

```bash
helm upgrade nvml-mock oci://ghcr.io/nvidia/k8s-test-infra/chart/nvml-mock --version "${MOKKA_VERSION:?see handson/README.md#pinned-versions}" \
  --namespace mokka --reuse-values --set nodeAgent.kernelLog.enabled=true \
  --wait --timeout 120s
```

If your cluster enforces Pod Security admission, also run:
`kubectl label namespace mokka pod-security.kubernetes.io/enforce=privileged`.
Under `baseline` or `restricted`, the DaemonSet is rejected outright, rather than only degraded.

On a kind cluster, the kernel ring buffer is **not per-node**.
An Xid written by one node's agent is visible in every node's `dmesg` on that host,
because kind nodes are containers that share one kernel.
Real nodes do not have this quirk.

### 6. NVLink and SRAM ECC error injection

```bash
kubectl -n mokka exec "$POD" -- nvml-mock-ctl nvlink-error --gpu 0 250   # 250 errors/sec, ramping
kubectl -n mokka exec "$POD" -- nvml-mock-ctl sram-ecc --gpu 0 --type correctable 12
kubectl -n mokka exec "$POD" -- nvml-mock-ctl nvlink-error --gpu 0 0     # heal
kubectl -n mokka exec "$POD" -- nvml-mock-ctl sram-ecc --gpu 0 0         # heal
```

See [H11](../11-dcgm-nvlink-fabric/README.md) for NVLink/NVSwitch topology (`nvidia-smi topo -m`) and fabric health degradation.
It also covers reading these same counters through a real,
standalone DCGM (`dcgmi`/`dcgm-exporter`), instead of through `nvidia-smi`.

### 7. `set` — arbitrary fields, and the memory-triple rule

```bash
# WRONG: only sets used_bytes; free_bytes is stale, so the two no longer add up
kubectl -n mokka exec "$POD" -- nvml-mock-ctl set --gpu 0 memory.used_bytes=1073741824

# RIGHT: set both together
kubectl -n mokka exec "$POD" -- nvml-mock-ctl set --gpu 0 \
  memory.used_bytes=1073741824 memory.free_bytes=41264611328

kubectl -n mokka exec "$POD" -- nvidia-smi --query-gpu=memory.used,memory.free,memory.total --format=csv
```

### 8. `reset` — return to the pristine profile

```bash
kubectl -n mokka exec "$POD" -- nvml-mock-ctl reset            # every device
kubectl -n mokka exec "$POD" -- nvml-mock-ctl status           # should be empty again
```

### 9. Drill: target the wrong node

This needs a **multi-node** cluster.
The H00 cluster is single-node by default:
a bare `kind create cluster` makes one node that is both control-plane and worker.
So there is only ever one `nvml-mock` pod to exec into,
which is not enough to show a per-node override being per-node.
Stand up a throwaway 3-node cluster for this drill:

```bash
kind create cluster --name mokka-multi --config manifests/kind-multi-node.yaml

helm install nvml-mock oci://ghcr.io/nvidia/k8s-test-infra/chart/nvml-mock --version "${MOKKA_VERSION:?see handson/README.md#pinned-versions}" \
  --namespace mokka --create-namespace --set-file gpu.customConfig=../profiles/b300.yaml \
  --wait --timeout 120s

kubectl get pods -n mokka -o wide
```

You should see **3** `nvml-mock` pods, one per node.
The chart's default `tolerations: [{operator: Exists}]` is why a pod also lands on the control-plane node,
which normally repels workloads.

Now inject an override on node A only, and read from both A and B:

```bash
NODES=($(kubectl get nodes -o jsonpath='{.items[*].metadata.name}'))
NODE_A="${NODES[0]}"
NODE_B="${NODES[1]}"

POD_A=$(./scripts/find-node-pod.sh "$NODE_A")
POD_B=$(./scripts/find-node-pod.sh "$NODE_B")

kubectl -n mokka exec "$POD_A" -- nvml-mock-ctl temp --gpu 0 95
sleep 2   # let the ~1s override TTL clear

kubectl -n mokka exec "$POD_A" -- nvidia-smi --query-gpu=temperature.gpu --format=csv   # 95
kubectl -n mokka exec "$POD_B" -- nvidia-smi --query-gpu=temperature.gpu --format=csv   # unchanged baseline
```

`$POD_B` shows the untouched baseline.
Overrides are per-node files, so changing the state on node A has **no effect** on node B.
This is the #1 cause of "my runtime change did nothing" reports.
See [H03](../03-troubleshooting/README.md#drill-3--a-runtime-change-does-nothing).

**Clean up this drill's cluster** before you move on,
so later modules do not accidentally point at it:

```bash
kind delete cluster --name mokka-multi
```

## Expected result

Each `nvml-mock-ctl` command returns immediately.
The corresponding `nvidia-smi`/`nvml` read reflects it within about one second,
the override poll TTL.
No Kubernetes object, such as the pod or the chart release, changes at all.

## Self-check

- Why must you run `nvml-mock-ctl` once per node, instead of once per cluster?
- You inject `--mode ecc_uncorrectable` with no `--after-calls`.
  When does it trip?

Check your answers in [the Self-check answers](../self-check-answers.md#h02).

Next: [H03 — Troubleshooting drills](../03-troubleshooting/README.md)
