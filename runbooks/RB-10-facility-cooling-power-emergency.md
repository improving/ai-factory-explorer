---
id: RB-10
title: Facility emergency - CDU or coolant loop alarm, rack power event, the drain before an emergency thermal shutdown
owner_layers: [L1, L7]
severity:
  default: SEV2
  escalate_to: "SEV1 when more than one rack is affected, when one NVL72 rack (one NVLink domain) goes down, when temperatures keep increasing, or when a leak is detected"
guide_refs: []
gist_refs: ["L1", "L2", "L7", "§10"]
related:
  upstream: []
  downstream: [RB-08, RB-03]
  lookalike: [RB-03]
gaps: [G52, G53]
---

# RB-10 — Facility emergency: CDU or coolant loop alarm, rack power event, the drain before an emergency thermal shutdown

This runbook owns the **drain sequence before an emergency thermal shutdown** (catalogue rows F1 and F3) and the PDU and power shelf part of F2.
The facility team owns the CDU, the coolant loop, and the power distribution; SRE owns the nodes and the jobs.
The goal: stop the jobs gracefully, with a checkpoint, before the hardware stops them.
RB-03 owns the thermal throttle of one GPU or one node; RB-08 owns the PSU and DPS power-policy part of F2 and the shared drain procedure.

## 1. Trigger

| # | Symptom (no verbatim string in the guide) | Decoder meaning |
|---|---|---|
| — | CDU or coolant loop alarm: low flow, high supply or return temperature, leak detection (catalogue F1) | The racks on that loop lose cooling. Liquid-cooled GPUs throttle, then the rack goes to an emergency thermal shutdown. |
| — | A thermal throttle on all nodes of one or more racks at the same time | A cooling cause, not a GPU cause: one GPU or one node is RB-03. |
| — | Rack power event: a PDU or power shelf down (catalogue F2) | The rack runs with less power redundancy; a second fault stops it. |
| — | The facility team announces an emergency shutdown of a rack or a row (catalogue F3) | Drain before the shutdown: section 6. |

## 2. Impact and blast radius

- **Severity:** SEV2 by default. SEV1 when more than one rack is affected, when one NVL72 rack (one NVLink domain) goes down, when the temperatures keep increasing, or when a leak is detected.
- **Priority:** SEV1 is P1 and SEV2 is P2 in the table of [runbooks/README.md](README.md) (a rack is more than one node).
- **Blast radius:** one PDU or power shelf: the rack runs with no redundancy. One CDU: all racks on its loop. One row: all its racks. On NVL72 one rack is one NVLink domain, so one rack can be one 72-GPU job.
- **The cost:** a job with a recent checkpoint loses minutes; a job with no checkpoint loses all the work since its last one.

## 3. First 5 minutes

1. `ipmitool sensor` `[C:L1]` on one node of each rack on the loop — expected: temperatures and fans in range; note the inlet and GPU temperatures.
2. `kubectl get nodes -o wide` `[C:L7]` or `sinfo -R` `[C:L7]` — list the nodes of the affected racks, and with `squeue` `[C:L7]` the jobs and tenants on them.
3. Confirm the alarm with the facility team in the incident channel: the CDU, the loop, flow, supply and return temperature, leak status `[GAP:G52]`.

**Who runs it:** L1 runs steps 1 to 3 (read-only; [l1-primer.md](../handbook/l1-primer.md)), opens the incident, and calls the facility team. The checkpoint request, cordon, drain, and job stop are L2.

## 4. Hardware variants

Row names follow [hardware-matrix.md](../handbook/hardware-matrix.md), Table 2 ("to be confirmed" = no source in the repository gives the signal).

| | Hopper HGX (H100/H200) | Blackwell HGX (B200/B300) | NVL72 rack (GB200/GB300) |
|---|---|---|---|
| Cooling | ask supplier | Dell B300: air (XE9780, XE9785) or liquid (XE9780L, XE9785L); other suppliers: ask supplier | Liquid-cooled rack |
| Unit of drain | The node | The node; on liquid cooling, all racks of the loop | The rack (one NVLink domain) |
| First signal | to be confirmed | to be confirmed | to be confirmed |

## 5. Decision table

| # | Layer | Command | Good looks like | Bad looks like | Next |
|---|---|---|---|---|---|
| 1 | L1 | `ipmitool sensor` `[C:L1]` | Temperatures in range on all racks | Temperatures that increase on the racks of one loop | Increase: step 4 and section 6 |
| 2 | L1 | `ipmitool sel list` `[C:L1]` | No thermal or PSU events | Thermal or PSU events at the time of the alarm | PDU or power shelf (a facility alarm, all nodes of the rack): stay here, F2, and tell the facility team. PSU on one node, no facility alarm: RB-08 |
| 3 | L2 | `nvidia-smi -q` `[C:L2]` | No thermal throttle reason | Thermal throttle on all GPUs of the racks | All racks of a loop: cooling cause, section 6. One node: RB-03 |
| 4 | L7 | `squeue` `[C:L7]` or `kubectl get nodes -o wide` `[C:L7]` | No jobs on the affected racks | Running jobs on the affected racks | List the jobs, the tenants, and the time of the last checkpoint; section 6 |

Rule: if the temperatures are stable with a throttle, keep the jobs and watch with the facility team. If they increase, start section 6 at once. If there is a leak, the facility procedure comes first, and the facility team decides on power-down.

**Who runs it:** L1 may run steps 1 to 4 (read-only). Section 6 is L2 and L3.

### Read-only diagnostics (by layer)

| Layer | Command | Tag | Look for |
|---|---|---|---|
| L1 | `ipmitool sensor` | `[C:L1]` | Inlet, GPU, and PSU temperatures; fans |
| L1 | `ipmitool sel list` | `[C:L1]` | Thermal and PSU events with times |
| L2 | `nvidia-smi -q` | `[C:L2]` | Clock throttle reasons (thermal, power) |
| L2 | `dcgmi health -c` | `[C:L2]` | Health verdicts before the return to service |
| L7 | `kubectl get nodes -o wide` | `[C:L7]` | Node state of the affected racks |
| L7 | `squeue` | `[C:L7]` | Jobs on the affected nodes |

### Differential diagnosis

| Looks like | How to tell | Go to |
|---|---|---|
| A thermal throttle of one GPU or one node | Only one node throttles; the other nodes of the rack are in range | RB-03 |
| A PSU or DPS power-policy fault | SEL shows PSU events on one node; no facility alarm | RB-08, RB-05 |
| A false alarm of the monitoring | The facility team sees normal flow and temperatures; the node sensors are in range | RB-09, the alert rule |

## 6. Mitigation

Safety checklist (before any state-changing action, here and in Repair below):

```
- Drain the node / job queue first: `kubectl drain --ignore-daemonsets` or `scontrol update ... State=DRAIN Reason="<ticket>"`.
- On NVL72, verify no active IMEX/ComputeDomain job: `kubectl get computedomains,resourceclaims -A`.
- Restarting `nvidia-fabricmanager` kills every CUDA context on the NVSwitch system.
- BIOS/firmware/BMC changes require a change window; some need AC power cycle.
- Switch fabric changes (`ufm_ha_cluster failover`, `nv config apply`) can drop RoCE/IB sessions.
```

For this runbook also: do not power off a rack yourself; the facility team decides on power-down.

> Every action below needs a ticket ID as the reason (Slurm `Reason="<ticket>"`, or the change record).

The sequence: cordon first (no new work starts), then the checkpoint, then stop the jobs, then confirm with the facility team.

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A1 | Cordon the nodes of the affected racks `[C:§10]` | `kubectl cordon <node>` or `scontrol update NodeName=<node> State=DRAIN Reason="<ticket>"` | **L2.** The ticket ID; the node list of the racks | No new jobs start on the racks; on Slurm, running jobs continue | `kubectl uncordon <node>` or `scontrol update NodeName=<node> State=RESUME`, after section 9 |
| A2 | Ask the tenants to checkpoint now `[GAP:G53]` | (no command text: the tenant or the platform starts the checkpoint) | **L2.** The job list of section 5 step 4; the time of the shutdown from the facility team | The jobs pause to write; storage load increases | n/a |
| A3 | Stop the jobs gracefully after their checkpoint `[C:§10]` | `kubectl drain <node> --ignore-daemonsets`; on Slurm, `scontrol requeue <job_id>` `[R]` for each running job | **L2.** A2 is done, or the time is up; on NVL72 the ComputeDomain check (Kubernetes) or `nvidia-imex-ctl -H -N` `[C:§11.5]` (Slurm) | The jobs stop; a requeued Slurm job waits in the queue | None: a stopped job restarts from its last checkpoint; uncordon after section 9 |
| A4 | Confirm with the facility team that no stateful work runs `[GAP:G52]` | (no command text: the facility team and the incident channel) | **L3.** A3 is done on all racks of the loop | None | n/a |

## 7. Repair

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A5 | The facility team repairs the CDU, the loop, or the power distribution `[GAP:G52]` | (no command text: the facility procedure) | **L3.** The incident has the alarm times and the drained node list | The racks stay out of service | n/a |

## 8. Evidence to collect

The facility alarm times (from the facility team), `ipmitool sel list` `[C:L1]` of the affected nodes, the GPU thermal and throttle telemetry from the dashboard, and the drained nodes and the stopped jobs with times.

## 9. Return to service

Follow the shared drain and return-to-service procedure in [_shared/safety-checklist.md](_shared/safety-checklist.md) (owned by RB-08).
Restored cooling is not enough. Add these RB-10 checks before the return:
1. The facility team releases the loop or the power, in the incident channel.
2. `ipmitool sensor` `[C:L1]` shows the temperatures at their baseline on each node.
3. `dcgmi health -c` `[C:L2]` is healthy on each node; then `kubectl uncordon <node>` `[C:§10]` or `scontrol update NodeName=<node> State=RESUME` `[C:§10]`.

## 10. Escalation

- **Internal:** L1 hands over to L2 at once (P1 or P2). L2 hands over to L3 for the facility decision and for more than one rack.
- **Facility:** the facility team owns the CDU, the loop, and the power, and joins the incident channel ([shift-discipline.md](../handbook/shift-discipline.md)).
- **Customer:** the customer contact of each affected tenant, on the update clock of the priority.

## 11. Customer message

> **SEV1/SEV2 template — facility emergency:**
> "A cooling (or power) failure affects racks <rack-ids>. To protect your jobs, we asked for a checkpoint and stopped the jobs on these racks under ticket <ticket-id>. The GPUs on these racks are not available until the facility team restores cooling (or power) and the nodes pass their health checks. Your jobs restart from their last checkpoint. Next update: <time>."

## Appendix A — Gaps & open questions

- `[GAP:G52]` No CLI command reads the facility telemetry (CDU flow, supply and return temperature, leak detection); the site's building management system or the facility team gives it. Add the command when the site names its BMS interface.
- `[GAP:G53]` No platform command asks a running job to checkpoint now; the tenant or the training framework does it. Add the platform mechanism if one exists.
- The time from a coolant loss to an emergency thermal shutdown is not in the repository; get it from the site (the CDU and the rack vendor).

## Appendix B — Source trace

| Step / claim | Guide section | Gist / external |
|---|---|---|
| Trigger rows | runbook catalogue F1, F2, F3 | none |
| First 5 minutes | none | L1 `ipmitool sensor`; L7 `kubectl get nodes -o wide`, `sinfo -R`, `squeue` |
| Decision table and diagnostics | none | L1 `ipmitool sensor`, `ipmitool sel list`; L2 `nvidia-smi -q`, `dcgmi health -c`; L7 `squeue` |
| A1/A3 and section 9 | safety checklist | §10 `kubectl cordon`, `kubectl drain`, `kubectl uncordon`, `scontrol update ... State=DRAIN`, `scontrol update ... State=RESUME`; §11.5 `nvidia-imex-ctl -H -N` |
| A3 on Slurm | none | `[R]` Slurm `scontrol` man page: requeue "Requeue a running, suspended or finished Slurm batch job into pending state" (https://slurm.schedmd.com/scontrol.html) |
| The facility team owns power and cooling | `handbook/shift-discipline.md` | none |
| Blast radius of one PDU, one CDU, one row | `handbook/concepts.md` section 1 | none |
