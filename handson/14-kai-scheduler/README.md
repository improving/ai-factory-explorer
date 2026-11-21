# H14 — KAI Scheduler: queues, quota, and topology

**Why:** "the cluster has free GPUs, but my job waits" is the second most common platform ticket after "the pod has no GPU".
The answer is not in the node.
It is in the queue, the gang, and the topology.
This lab makes the scheduler's decision visible, with no GPU hardware.

**Serves:** M9 (the scheduler block), M5 (queue metrics).
**Cluster:** new `kind` cluster with 2 workers; simulated GPUs from the fake-gpu-operator.
**Time:** 75 minutes.

## Concepts

- **Queue.** The scheduling primitive. A leaf queue holds workloads; a parent queue organizes its children.
  Four fields decide the outcome: `quota` (guaranteed), `limit` (hard cap), `overQuotaWeight` (share of surplus at the same priority), and `priority` (the order of the surplus buckets).
- **Queue priority against workload priority.** Queue priority distributes surplus between queues.
  Workload priority (`priorityClassName`) orders and preempts inside one queue.
  Neither one changes the guaranteed quota.
- **Preemption against reclaim.** Preemption is inside one queue, and it needs a strictly higher priority and a preemptible victim.
  Reclaim is between queues, and it needs the reclaimer below its deserved quota and the victim's queue above its own.
  In-quota resources are protected by default.
- **Gang.** A PodGroup is scheduled as a whole or not at all.
  A Job with `parallelism: 6` and `kai.scheduler/batch-min-member: "6"` waits until 6 GPUs are free in one scheduling decision.
- **Topology-aware scheduling.** A `Topology` object names the node labels that form the levels.
  A workload sets a required level (the outer boundary) and a preferred level (where to pack).
  The scheduler bin-packs the domain, then maximizes locality inside it.
- **Simulated GPUs.** The fake-gpu-operator advertises 8 `nvidia.com/gpu` on each worker.
  KAI schedules them exactly as it schedules real GPUs.
  Two workers give 16 GPUs.

## Prerequisites

| Tool | Check |
|---|---|
| `docker`, `kind`, `helm` 3.8+, `kubectl` | `docker info`, `kind version`, `helm version` |
| The pinned versions | see [handson/README.md](../README.md#pinned-versions) |

```bash
export FGO_VERSION=0.2.1        # keep in step with handson/README.md
export KAI_VERSION=v0.18.6
```

## Part A — the cluster and the simulator

```bash
kind create cluster --name kai-lab --config - <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
    labels:
      run.ai/simulated-gpu-node-pool: default
      lab.example.com/zone: z1
      lab.example.com/rack: r1
  - role: worker
    labels:
      run.ai/simulated-gpu-node-pool: default
      lab.example.com/zone: z1
      lab.example.com/rack: r2
EOF
```

Create the simulator values.
They match the file that KAI uses in its own CI (`hack/fake-gpu-operator-values.yaml`).

```yaml
# fgo-values.yaml
topology:
  nodePools:
    default:
      gpu:
        backend: fake
        overrides:
          device_defaults:
            name: Tesla-K80
            memory:
              total_bytes: 11996758016
          devices: [{}, {}, {}, {}, {}, {}, {}, {}]
      numa:
        zones: 2
        distances: { self: 10, remote: 21 }
environment:
  resourceReservationNamespace: kai-resource-reservation
statusUpdater:
  disableNodeLabeling: true
statusExporter:
  nodeResourceTopology:
    enabled: true
    installCRD: true
```

```bash
helm upgrade -i fgo oci://ghcr.io/run-ai/fake-gpu-operator/fake-gpu-operator \
  --version "$FGO_VERSION" -n fgo --create-namespace -f fgo-values.yaml --wait

kubectl get nodes -L run.ai/simulated-gpu-node-pool \
  -o custom-columns='NODE:.metadata.name,POOL:.metadata.labels.run\.ai/simulated-gpu-node-pool,GPUS:.status.allocatable.nvidia\.com/gpu'
```

**Expected:** each worker advertises `nvidia.com/gpu: 8`.

Install KAI Scheduler.
The chart is an OCI artifact.

```bash
helm upgrade -i kai-scheduler oci://ghcr.io/kai-scheduler/kai-scheduler/kai-scheduler \
  --version "$KAI_VERSION" -n kai-scheduler --create-namespace --wait

kubectl get queue
```

**Expected:** `default-parent-queue` and `default-queue` exist.
The chart creates them on a fresh install.

## Part B — a queue limit blocks a gang

Create a parent queue and three leaf queues.
The cluster has 16 GPUs, and the three quotas add up to 16.

```yaml
# queues.yaml
apiVersion: scheduling.run.ai/v2
kind: Queue
metadata:
  name: lab-parent
spec:
  resources:
    gpu: { quota: 0, limit: -1, overQuotaWeight: 1 }
---
apiVersion: scheduling.run.ai/v2
kind: Queue
metadata:
  name: team-a
spec:
  parentQueue: lab-parent
  priority: 1
  resources:
    gpu: { quota: 8, limit: 12, overQuotaWeight: 1 }
---
apiVersion: scheduling.run.ai/v2
kind: Queue
metadata:
  name: team-b
spec:
  parentQueue: lab-parent
  priority: 1
  resources:
    gpu: { quota: 2, limit: 4, overQuotaWeight: 1 }
---
apiVersion: scheduling.run.ai/v2
kind: Queue
metadata:
  name: team-c
spec:
  parentQueue: lab-parent
  priority: 1
  resources:
    gpu: { quota: 6, limit: 8, overQuotaWeight: 1 }
```

```bash
kubectl apply -f queues.yaml
kubectl get queue
```

Submit a 6-GPU gang job in `team-b`.
The queue limit is 4, so it cannot fit.

```yaml
# gang-b.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: gang-b
  labels:
    kai.scheduler/queue: team-b
  annotations:
    kai.scheduler/batch-min-member: "6"
spec:
  parallelism: 6
  completions: 6
  template:
    metadata:
      labels:
        kai.scheduler/queue: team-b
      annotations:
        kai.scheduler/batch-min-member: "6"
    spec:
      schedulerName: kai-scheduler
      containers:
        - name: main
          image: ubuntu
          command: ["bash", "-c", "sleep 3600"]
          resources:
            limits:
              nvidia.com/gpu: "1"
```

```bash
kubectl apply -f gang-b.yaml
kubectl get pods -l job-name=gang-b
kubectl get podgroups -o wide
```

**Expected:** no pod runs.
The PodGroup is `Pending`.

Read the reason in this order.
This is the order of the self-check.

```bash
kubectl get queue team-b -o yaml
kubectl describe podgroup <podgroup-of-gang-b>
kubectl get events --sort-by=.lastTimestamp | grep -i -E 'gang|queue|quota' | tail -20
```

**Expected:** the queue shows `quota: 2` and `limit: 4`.
The PodGroup shows `minMember: 6` and an unsatisfied condition.
The events name the queue and the gang, not the node.

Raise the limit to 8.
The gang now fits in the queue limit, and the cluster is empty, so it runs over quota.

```bash
kubectl patch queue team-b --type merge -p '{"spec":{"resources":{"gpu":{"quota":2,"limit":8,"overQuotaWeight":1}}}}'
kubectl get pods -l job-name=gang-b -o wide
```

**Expected:** 6 pods `Running`.

Delete the gang before the next part.

```bash
kubectl delete job gang-b --cascade=foreground
kubectl patch queue team-b --type merge -p '{"spec":{"resources":{"gpu":{"quota":2,"limit":4,"overQuotaWeight":1}}}}'
```

## Part C — quota protection, then reclaim

Fill all three queues to their guaranteed quota.
Use the `build` class (priority 100, non-preemptible) for all three.

```yaml
# in-quota.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: a1-in-quota
  labels: { kai.scheduler/queue: team-a }
spec:
  parallelism: 8
  completions: 8
  template:
    metadata:
      labels: { kai.scheduler/queue: team-a }
    spec:
      schedulerName: kai-scheduler
      priorityClassName: build
      containers:
        - name: main
          image: ubuntu
          command: ["bash", "-c", "sleep 3600"]
          resources: { limits: { nvidia.com/gpu: "1" } }
---
apiVersion: batch/v1
kind: Job
metadata:
  name: b1-in-quota
  labels: { kai.scheduler/queue: team-b }
spec:
  parallelism: 2
  completions: 2
  template:
    metadata:
      labels: { kai.scheduler/queue: team-b }
    spec:
      schedulerName: kai-scheduler
      priorityClassName: build
      containers:
        - name: main
          image: ubuntu
          command: ["bash", "-c", "sleep 3600"]
          resources: { limits: { nvidia.com/gpu: "1" } }
---
apiVersion: batch/v1
kind: Job
metadata:
  name: c1-in-quota
  labels: { kai.scheduler/queue: team-c }
spec:
  parallelism: 6
  completions: 6
  template:
    metadata:
      labels: { kai.scheduler/queue: team-c }
    spec:
      schedulerName: kai-scheduler
      priorityClassName: build
      containers:
        - name: main
          image: ubuntu
          command: ["bash", "-c", "sleep 3600"]
          resources: { limits: { nvidia.com/gpu: "1" } }
```

```bash
kubectl apply -f in-quota.yaml
kubectl get pods -o wide | grep -E 'a1-in-quota|b1-in-quota|c1-in-quota'
```

**Expected:** 16 pods `Running`.
All 16 GPUs are in quota.

Now `team-b` asks for 2 more GPUs with a preemptible class (`train`, priority 50).
It has a limit of 4, so the request is allowed.
Reclaim must not touch in-quota work, and every other queue is exactly at its quota.

```bash
kubectl create -f - <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: b2-over-quota
  labels: { kai.scheduler/queue: team-b }
spec:
  parallelism: 2
  completions: 2
  template:
    metadata:
      labels: { kai.scheduler/queue: team-b }
    spec:
      schedulerName: kai-scheduler
      priorityClassName: train
      containers:
        - name: main
          image: ubuntu
          command: ["bash", "-c", "sleep 3600"]
          resources: { limits: { nvidia.com/gpu: "1" } }
EOF
kubectl get pods -l job-name=b2-over-quota
```

**Expected:** `Pending`.
This is quota protection: no queue is over its deserved quota, so reclaim has no victim.

Now free 6 GPUs, and let `team-b` take them over quota.

```bash
kubectl delete job c1-in-quota --cascade=foreground
kubectl get pods -l job-name=b2-over-quota -o wide
```

**Expected:** 2 pods `Running`.
`team-b` is now at 4 GPUs: 2 in quota and 2 over quota.

Now `team-c` asks for its 6 in-quota GPUs.
Only 4 are free, and `team-b` holds 2 over its deserved quota with a preemptible class.

```bash
kubectl apply -f - <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: c2-in-quota
  labels: { kai.scheduler/queue: team-c }
spec:
  parallelism: 6
  completions: 6
  template:
    metadata:
      labels: { kai.scheduler/queue: team-c }
    spec:
      schedulerName: kai-scheduler
      priorityClassName: build
      containers:
        - name: main
          image: ubuntu
          command: ["bash", "-c", "sleep 3600"]
          resources: { limits: { nvidia.com/gpu: "1" } }
EOF
kubectl get pods -l job-name=b2-over-quota
kubectl get pods -l job-name=b1-in-quota
kubectl get pods -l job-name=c2-in-quota
```

**Expected:** `b2-over-quota` is evicted, `b1-in-quota` keeps running, and `c2-in-quota` runs.
The scheduler evicted the over-quota preemptible pods, and it did not touch the in-quota non-preemptible pods.

**What to record:** for each of the four outcomes, the object that showed the reason, and the sentence that it printed.

## Part D — topology-aware placement

Create the topology and label the levels.

```yaml
# topology.yaml
apiVersion: kai.scheduler/v1alpha1
kind: Topology
metadata:
  name: lab-topology
spec:
  levels:
    - nodeLabel: lab.example.com/zone
    - nodeLabel: lab.example.com/rack
    - nodeLabel: kubernetes.io/hostname
```

```bash
kubectl apply -f topology.yaml
kubectl get topology
```

Delete the running jobs, so that the placement is visible.

```bash
kubectl delete job a1-in-quota b1-in-quota c2-in-quota --ignore-not-found
```

Submit a 4-pod job that requires the zone and prefers a rack.

```yaml
# tas.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: tas-job
  labels: { kai.scheduler/queue: team-a }
spec:
  parallelism: 4
  completions: 4
  template:
    metadata:
      labels: { kai.scheduler/queue: team-a }
      annotations:
        kai.scheduler/topology: lab-topology
        kai.scheduler/topology-required-placement: lab.example.com/zone
        kai.scheduler/topology-preferred-placement: lab.example.com/rack
    spec:
      schedulerName: kai-scheduler
      containers:
        - name: main
          image: ubuntu
          command: ["bash", "-c", "sleep 3600"]
          resources: { limits: { nvidia.com/gpu: "1" } }
```

```bash
kubectl apply -f tas.yaml
kubectl get pods -l job-name=tas-job -o wide
kubectl get events --sort-by=.lastTimestamp | grep -i -E 'topology|domain|rack' | tail -10
```

**Expected:** all 4 pods land in one rack (one worker), because the preferred level packs them.
Both racks are in `z1`, so the required level does not split them.

Now require the rack, and ask for 12 pods.
No rack has 12 free GPUs, so the job must stay pending.
The pod template of a Job is immutable, so delete the job and create a new one.

```bash
kubectl delete job tas-job --cascade=foreground

sed 's/name: tas-job/name: tas-job-rack/; s|topology-required-placement: lab.example.com/zone|topology-required-placement: lab.example.com/rack|; s/parallelism: 4/parallelism: 12/; s/completions: 4/completions: 12/' tas.yaml | kubectl apply -f -

kubectl get pods -l job-name=tas-job-rack
```

**Expected:** the pods stay `Pending`, and the events name the topology domain.
This is the same signature as the gang in Part B, with a different cause.

## Part E — the metrics

Port-forward the queue controller and read its metrics.

```bash
kubectl -n kai-scheduler get deploy
kubectl -n kai-scheduler port-forward deploy/queue-controller 8080:8080 &
curl -s localhost:8080/metrics | grep -E '^queue_(deserved|allocated|quota|fair_share)_gpus'
```

**Expected:** one series for each leaf queue.
`queue_allocated_gpus` follows the running pods; `queue_deserved_gpus` follows the quota and the fair share.
Compare the two values with the queue objects.

Stop the port-forward with `kill %1`.

## Troubleshooting

| Symptom | Cause | Check |
|---|---|---|
| No worker shows `nvidia.com/gpu` | The pool label does not match the pool name, or the FGO pods are not ready | `kubectl get pods -n fgo`, `kubectl get nodes --show-labels` |
| The job has no PodGroup | The pod does not use `schedulerName: kai-scheduler` | `kubectl get pod <pod> -o jsonpath='{.spec.schedulerName}'` |
| The job is pending with no event | The pod is not in a queue | the label `kai.scheduler/queue` |
| `Queue` is rejected | The API group is wrong | `apiVersion: scheduling.run.ai/v2` |
| The 12-pod job runs | The topology annotation is on the Job only | put the annotation on the pod template too |

## Cleanup

```bash
kind delete cluster --name kai-lab
```

## Self-check

A 32-GPU gang job waits, and the cluster shows 40 free GPUs.
Name the four objects that you read, in order, and the reason that each one can block the job.
(1. The Queue: quota and limit. 2. The PodGroup: `minMember` and its condition. 3. The Topology: the required level and the free capacity in each domain. 4. The Node: taints, labels, and the allocatable GPU count.)
Then answer: why does a queue that is exactly at its quota keep its GPUs when another queue is below its own?
