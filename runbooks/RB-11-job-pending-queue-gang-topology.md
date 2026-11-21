---
id: RB-11
title: Job pending - queue quota, gang, topology, or node eligibility
owner_layers: [L7, L6]
severity:
  default: SEV3
  escalate_to: "SEV2 when a tenant's whole queue is blocked or a production job misses its start window"
signatures: [102, 103, 104, 105]
guide_refs: ["§4", "P (Platform / scheduling)"]
gist_refs: ["L7", "§9"]
related:
  upstream: [RB-08]
  downstream: [RB-08, RB-02]
  lookalike: [RB-08, RB-03]
gaps: [G11, G12]
---

# RB-11 — Job pending: queue quota, gang, topology, or node eligibility

This runbook owns the **"the cluster has free GPUs but my job waits"** ticket.
It covers KAI Scheduler and NVIDIA Run:ai, which share the queue model, and it gives the Slurm equivalent.
It does not own a node fault; that is [RB-08](RB-08-platform-scheduling-slurm-k8s-bcm-power.md) (P4) or [RB-03](RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md).

## 1. Trigger

| # | Signature (verbatim) | Decoder meaning |
|---|---|---|
| 102 | Pod `Pending`; `kubectl describe podgroup` shows the queue over `quota` or `limit`; `kubectl get queue` shows the numbers | The queue policy blocks the job. The node capacity is not the cause. |
| 103 | PodGroup `Pending` with `minMember` greater than the largest free gang | Gang scheduling: the job needs all its pods in one decision. Scattered free GPUs do not help. |
| 104 | Event names the topology domain, or `topology-required-placement`; the domain has less free capacity than the job | Topology-aware scheduling: the required level has no domain that fits. |
| 105 | Pod `Pending` with no queue event; `schedulerName` is not `kai-scheduler`, the queue label is missing, or the node is tainted | The pod never reached the queue. |

**Where each signature starts in section 5:**
102 → decision step 2. 103 → step 3. 104 → step 4. 105 → step 1.

## 2. Impact and blast radius

- **Severity:** SEV3 by default (one job waits, nothing is broken).
  SEV2 when a tenant's whole queue is blocked, or a production job misses its start window.
- **Priority:** P3 by default; P2 for a blocked production queue.
- **Blast radius:** one job, or one queue (every job of that tenant on that node pool).
  A topology or quota mistake can block a whole project without a single alert.

## 3. First 5 minutes

Run these in order. Each one is read-only.

1. `kubectl get pod <pod> -o wide` and `kubectl describe pod <pod> | tail -20` `[C:L7]` — expected: the pod is `Pending`, and the last event names a reason. No event means the pod is not scheduled by KAI (signature 105).
2. `kubectl get podgroups -o wide` and `kubectl describe podgroup <name>` `[C:L7]` — expected: `minMember` and a condition. Compare `minMember` with the largest free gang on one node or in one domain.
3. `kubectl get queue <queue-name> -o yaml` `[C:L7]` — expected: `quota`, `limit`, `overQuotaWeight`, `priority`. Read `status` for the allocated value.

Dashboards to open: the queue panels from `queue_deserved_gpus`, `queue_allocated_gpus`, and `queue_fair_share_gpu` (M5).

**Who runs it:** L1 runs steps 1 to 3 (read-only). Any change to a queue is L3 and needs the platform owner and the tenant.

## 4. Hardware variants

| Fleet | Difference |
|---|---|
| HGX B200/B300 | The topology levels are the rack and the node. A gang of 8 fits one node; a gang above 8 needs a rack or a block. |
| GB200/GB300 NVL72 | The NVLink domain is the hard boundary. A job that spans two NVL domains pays the fabric cost, and some jobs must not span them at all. |
| AMD Instinct | The same queue model; the resource name is `amd.com/gpu`. Topology labels come from the node, not from NVLink. |
| Slurm | `squeue -j <id> -o '%r'` gives the reason: `Resources`, `Priority`, `QOSMaxGRESPerUser`, `ReqNodeNotAvail`. `scontrol show job <id>` gives the partition and the GRES request. |

## 5. Decision table

| # | Observation | Conclusion | Next action |
|---|---|---|---|
| 1 | `schedulerName` is `default-scheduler`, or the pod has no `kai.scheduler/queue` label | The pod bypassed KAI | Set the scheduler and the queue on the pod template. Mitigation A1 |
| 2 | `allocated` equals `limit` for the queue, and the request is inside `quota` | The hard cap blocks the job, not the fair share | Raise the limit (L3, approval) or move the job to another queue. Mitigation A2 |
| 3 | The PodGroup condition names `minMember`, and the free GPUs are scattered | Gang scheduling blocks the job | Reduce `minMember`, wait for a full gang, or free a block. Mitigation A3 |
| 4 | The event names the topology level, and no domain fits | The required placement is too tight for the current free capacity | Relax the required level to a preferred level, or wait. Mitigation A4 |
| 5 | The queue is below `quota`, the cluster has free GPUs, and the job still waits | A taint, a label, or a node condition blocks the nodes | Check the taints and the node conditions (RB-08 P4). Mitigation A5 |
| 6 | `queue_deserved_gpus` is lower than the quota, and another queue is over its own | Fairshare, not quota, decides the surplus | Wait for reclaim, or raise the queue priority (L3). Mitigation A2 |
| 7 | The job is in a queue that belongs to another shard | Shards do not share capacity | Move the job to a queue in the right shard, or add capacity to that shard. Mitigation A6 |
| 8 | Slurm: `Reason=Resources` with idle nodes | The partition, the GRES count, or the reservation blocks the job | Check `sinfo -p <partition>`, the reservations, and the GRES. Mitigation A7 |

## 6. Mitigation

| # | Action | Before you run it | Impact | Undo |
|---|---|---|---|---|
| A1 | Add `schedulerName: kai-scheduler` and the queue label to the pod template | **L3.** Job owner agrees; the job is re-submitted, not patched in place | The job enters the queue | Remove the fields and re-submit |
| A2 | Raise the queue `limit`, or change `priority` or `overQuotaWeight` | **L3.** Platform owner and the affected tenants agree; the change is a quota change and goes in the change record | Other queues may lose surplus | Restore the previous `Queue` object |
| A3 | Reduce `kai.scheduler/batch-min-member`, or the parallelism | **L2.** Job owner decides; a smaller gang changes the job's shape | The job starts sooner with fewer workers | Re-submit with the original value |
| A4 | Change `topology-required-placement` to `topology-preferred-placement` | **L2.** Job owner decides; the job may cross a rack or a domain and run slower | The job starts; the communication cost may rise | Re-submit with the required level |
| A5 | Remove the taint, or fix the node condition | **L2.** Follow [RB-08](RB-08-platform-scheduling-slurm-k8s-bcm-power.md) section 6 and the shared safety checklist | The node accepts work | Re-apply the taint |
| A6 | Move the job to a queue in the correct shard | **L2.** Job owner agrees | The job enters the right pool | Re-submit to the original queue |
| A7 | Slurm: change the partition, the GRES request, or the reservation | **L2.** Job owner agrees | The job can start | Re-submit the original request |

Never turn off gang scheduling to start one job.
Never remove a quota to start one job.
Both fix the ticket and break the contract with the other tenants.

## 7. Repair

1. **Correct the queue definition.** Put the intended quota, limit, weight, and priority in the queue object in Git, and apply it through the normal change flow.
   A manual `kubectl patch` is drift; record it, and put it in the source of truth the same day.
2. **Correct the workload template.** The queue label, the scheduler name, `minMember`, and the topology annotations belong in the job template of the team, not in one job.
3. **Correct the topology.** If the labels do not match the physical topology, fix the labels at the source (the node pool or the topology provider), not in each job.
4. **Right-size the shards and the quotas.** If a queue is permanently over quota and another is permanently idle, the split is wrong. Change it in the quarterly review, not during an incident.

## 8. Evidence to collect

- The pod events, the PodGroup YAML, and the queue YAML at the time of the ticket.
- The queue metrics for the hour before the ticket.
- The node taints and labels of the candidate nodes.
- For Slurm: `scontrol show job`, `sinfo -R`, and the reservation list.

## 9. Return to service

- [ ] The job runs, or the owner accepts the new shape (a smaller gang, a wider topology).
- [ ] The queue metrics show the expected allocation.
- [ ] The change is in the queue object in Git, and the drift is closed.
- [ ] The team's job template carries the fix.

## 10. Escalation

- L1 → L2 at the end of section 3, with the three objects.
- L2 → L3 (platform) for a queue or shard change.
- L3 → the vendor for a scheduler bug, with the events, the queue and PodGroup YAML, and the scheduler version.

## 11. Customer message

> Your job is waiting for capacity inside its project quota, not for a hardware fault.
> The project may use up to <limit> GPUs on this pool, and <allocated> are in use.
> We have <action> and will update you at <time>.

For a gang or topology cause, name the constraint and the option: "the job needs <n> GPUs in one <rack/domain>; the largest free block is <m>."

## Appendix A — Gaps & open questions

- `[GAP:G11]` The exact PodGroup condition strings differ between KAI versions. Confirm the text on the pinned version (v0.18.6) before you quote it in a runbook.
- `[GAP:G12]` The topology fit-error message is not published verbatim. Record it from the lab (H14, Part D) and add it here.

## Appendix B — Source trace

| Section | Source |
|---|---|
| Concepts, queue fields, preemption and reclaim | KAI Scheduler, `docs/queues/README.md` and `docs/scheduling-deep-dive/README.md` |
| Gang and subgroups | KAI Scheduler, `docs/batch/README.md` |
| Topology levels and placement | KAI Scheduler, `docs/topology/README.md` |
| Metrics | KAI Scheduler, `docs/metrics/METRICS.md` |
| Run:ai quota model | NVIDIA Run:ai, `docs/platform-management/runai-scheduler/scheduling/concepts-and-principles.md` |
| Commands | `kubectl`; the KAI and Run:ai documentation; the Slurm `squeue` and `scontrol` pages |
