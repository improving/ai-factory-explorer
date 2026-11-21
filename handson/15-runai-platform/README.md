# H15 — NVIDIA Run:ai on one machine: quota, fairshare, and a workload

**Why:** the customer ticket says "our project is over quota" or "our inference pods are preempted".
Those sentences come from a platform model, not from Kubernetes.
This lab runs that model on one machine, with simulated GPUs, and shows the four numbers behind the ticket.

**Serves:** M9 (the platform block), M11 (the workload model).
**Cluster:** one `kind` cluster, built by `local-dev.sh`; no GPU.
**Time:** 2 to 3 hours, most of it the first build.
**Tier:** T1. This lab is not part of the class path.

## Concepts

- **Two components.** A control plane, and cluster services on each Kubernetes cluster.
  The control plane is the management layer; the cluster services extend the scheduler.
- **Department, project, node pool.** A project queue is bound to its department queue, for each node pool.
  The department quota constrains the sum of its projects.
- **Deserved quota, over-quota, weight, limit.** Quota is guaranteed.
  Over-quota is the share of unused capacity, split by weight.
  Limit caps quota plus over-quota.
  Rank orders siblings.
- **Fairshare.** Quota plus the share of unused capacity, capped by the demand.
  The scheduler moves capacity from a queue above its fairshare to one below it.
- **Preemption policy.** Preemptible, non-preemptible, or semi-preemptible.
  A semi-preemptible workload keeps `minMembers` pods and lets the rest be preempted.
- **The failure taxonomy.** Exit 137 is SIGKILL, not a cause; a kubelet reason beats an exit-code guess; recurrence is a finding.

## Prerequisites

The local stack builds about 50 Go services, then loads them into a `kind` cluster.
It is heavy. Check the host before you start.

| Host | Requirement |
|---|---|
| Linux | 4 CPUs or more, 16 GB of RAM or more, 100 GB of free disk or more |
| macOS | Podman, not Docker Desktop; a VM with 12 GB of RAM or more, and 300 GB of disk; `podman machine set --rootful` |
| Tools | Docker or Podman, `make`, `git`, `curl`, `python3`, `openssl`; `kind`, `kubectl`, and `helm` are installed by the script |

```bash
export RUNAI_VERSION=3.0.20   # the repository release
```

On macOS, size the VM first.

```bash
podman machine stop
podman machine set --memory 12288 --cpus 6
podman machine set --rootful
podman machine start
```

## Option A — run the stack

### Part A — deploy

```bash
git clone --branch 3.0.20 https://github.com/dsx-ai-factory/run-ai.git
cd run-ai
./local-dev.sh --skip-frontend --parallel 2
```

The script prints the URL, the administrator email, and the password at the end.
The stack uses the fake-gpu-operator, so the cluster has simulated GPUs.

**Expected:** the script ends with the UI and the CLI ready, and the pods are `Running`.

```bash
kubectl get pods -A | grep -c runai
runai --help
```

### Part B — the organization

Open the UI with the printed URL, and create:

1. A department, `lab-dept`.
2. A project under it, `team-a`, with a quota on the default node pool.
   Set the quota to 4 GPUs and the limit to 6.
3. A second project, `team-b`, with a quota of 2 and a limit of 2.

Write down the four numbers for each project: quota, over-quota weight, limit, rank.

If the UI asks for a node pool, use the default pool that the installer created.

### Part C — a workload inside the quota

Submit a training workload of 4 GPUs in `team-a`, from the UI or with the CLI.

```bash
runai workload submit --help
runai workload list
runai workload describe <workload-name>
```

**Expected:** the workload runs, and it consumes its deserved quota.

Read the status fields and answer:

1. Which project owns the workload?
2. How many GPUs does it request, and how many does it have?
3. Is it preemptible?

### Part D — over quota, then reclaim

Submit a second workload in `team-a`, 2 GPUs, with a preemptible priority.
The project is at its quota of 4, so this workload uses over-quota capacity.
Its limit of 6 allows it.

```bash
runai workload list
```

**Expected:** the second workload runs, because the cluster has free capacity.

Now fill the cluster from `team-b`.
Submit 2 GPUs in `team-b`, inside its quota.
There is no free capacity left: `team-a` holds 4 in quota and 2 over quota.

**Expected:** `team-b` waits, then the over-quota workload in `team-a` is reclaimed and `team-b` runs.
The reason is fairness: `team-a` is over its deserved quota, and `team-b` is below its own.

Record the sequence and the object that showed each step.

### Part E — a semi-preemptible workload

Submit an inference workload in `team-b` with a semi-preemptible policy and `minMembers: 1`, with 2 replicas.
Then submit a higher-priority workload in the same project that needs both GPUs.

**Expected:** the pod inside `minMembers` keeps running, and the pod above it is preempted.
This is the contract for inference with burst capacity.

### Part F — the read-only tools

The repository ships an MCP server and agent skills.
Read [the tools reference](https://github.com/dsx-ai-factory/run-ai/blob/main/docs/agents/tools-reference.md), then answer:

1. Which read tool answers "why is this workload pending?"
2. Which read tool answers "which project is over quota on this node pool?"
3. What does a write tool require before it changes anything?

If you have an MCP client, connect it to the server and call one read tool.
Keep the write tools off.

## Option B — walk through it without the stack

Read these pages and write the same table:

1. [Concepts and Principles](https://github.com/dsx-ai-factory/run-ai/blob/main/docs/platform-management/runai-scheduler/scheduling/concepts-and-principles.md)
2. [How the Scheduler Works](https://github.com/dsx-ai-factory/run-ai/blob/main/docs/platform-management/runai-scheduler/scheduling/how-the-scheduler-works.md)
3. [MCP tools reference](https://github.com/dsx-ai-factory/run-ai/blob/main/docs/agents/tools-reference.md)

Then answer the self-check from the pages alone.

## Troubleshooting

| Symptom | Cause | Check |
|---|---|---|
| The API server starves, and the cluster never stabilizes | The Podman VM has 8 GB or less | Raise the VM to 12 GB and recreate it |
| `kind` fails with a permission error on macOS | The Podman machine is rootless | `podman machine set --rootful`, then restart |
| `no space left on device` during the build | The VM disk is full | Recreate the VM with 300 GB, or prune the build cache |
| A GPU workload stays pending | The fake-gpu-operator is not installed, or the pool has no GPUs | `kubectl get nodes -o custom-columns=...`, and the pods in the GPU namespace |
| The UI does not open | The frontend build was skipped | Re-run without `--skip-frontend` |

## Cleanup

```bash
./local-dev.sh --teardown --purge
```

This removes the `kind` cluster, the registry, the images, and the generated files.

## Self-check

A project has quota 8, limit 12, and rank 1 in its department.
It runs 10 GPUs, all preemptible, and a sibling project with quota 4 and rank 2 runs none.
The sibling submits 4 GPUs with a non-preemptible class.
What happens, and why?
(The sibling is below its deserved quota, and the first project is above its own; the scheduler reclaims the over-quota preemptible pods, and the non-preemptible workload runs inside the sibling's quota. If the first project were exactly at 8, its in-quota work would be protected, and the sibling would wait.)
