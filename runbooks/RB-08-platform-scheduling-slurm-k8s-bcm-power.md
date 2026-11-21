---
id: RB-08
title: Platform / scheduling - Slurm, Kubernetes (Rafay), BCM, PSU / DPS power-policy errors
owner_layers: [L7, L1]
severity:
  default: SEV3
  escalate_to: "SEV2 when production jobs cannot be scheduled; SEV1 when the control plane (Rafay controller, BCM head node) is degraded cluster-wide"
signatures: [86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96]
guide_refs: ["§1", "§4", "D (Platform / power / policy messages)", "P (Platform / scheduling)", "State-changing safety checklist"]
gist_refs: ["L7", "L8", "L1", "§9", "§10"]
related:
  upstream: [RB-01, RB-07]
  downstream: [RB-05, RB-01]
  lookalike: [RB-01]
gaps: [G09]
---

# RB-08 — Platform / scheduling: Slurm, Kubernetes (Rafay), BCM, PSU / DPS power-policy errors

This runbook owns the **drain / cordon / uncordon / DRAIN / RESUME** actions and the **return-to-service procedure** (see `_shared/safety-checklist.md`). Other runbooks link here.

## 1. Trigger

| # | Signature (verbatim) | Decoder meaning |
|---|---|---|
| 86 | `policy capability max cannot be more than active psu policy limit max` (DPS 0.9.0 on DGX_B300) | *Outside this fleet (DGX or BCM only: DPS on DGX B300; the Dell servers of this fleet have no DPS).* DPS resource-group power policy conflicts with the active BMC PSU policy. Firmware/DPS/BMC version alignment. |
| 87 | `sinfo`/`squeue` nodelist empty; `sinfo -R` shows no nodes in queue / empty nodelist | BCM/Slurm queue assignment misconfiguration; nodes not mapped to the intended job queue. |
| 88 | `Problems Integrating BCM to an existing cluster` (Slurm already present) | *Outside this fleet (DGX or BCM only; applies only if BCM is present).* BCM and an existing Slurm install conflict. |
| 89 | BCM 11 CVE-2025-62878: `Local Path Provisioner updated to v0.0.34` | *Outside this fleet (DGX or BCM only; applies only if BCM-managed Kubernetes is present).* Security update that needs a change window. |
| 90 | NMC 2.0 vs 1.1: `SR-IOV NetworkNodePolicy` step difference for DGX B200/BasePOD | *Outside this fleet (DGX or BCM only: DGX B200/BasePOD with NMC).* Step difference between NMC versions. |
| 91 | Pod stuck `Pending` / `ContainerCreating`; pod `Running` but no GPU | Scheduling, device-plugin or driver-pod problem. |
| 92 | Slurm job didn't start or failed; GRES missing | Node/GRES state or queue issue. |
| 93 | Rafay controller degraded; blueprint roll | Control-plane health or add-on change. |
| 94 | DGX Station sizing: 2× RAM-to-VRAM ratio confusion; local NVMe space / 1T LLM model sizing at FP4; ConnectX-8 SuperNIC mode questions (IB vs Ethernet) | *Outside this fleet (DGX Station).* Sizing questions, **not a fault**. Use **AI Factory Explorer** `<link TBD>` (DC sizing and visualization utility). No runbook. |
| 95 | Node `NotReady` with no other cause (time skew) | Check `chronyc` before deeper work. |
| 96 | Alert noise / metrics missing during triage | L8 exporter or alert-routing issue. |
| — | Cluster shows "not reachable" in Rafay (catalogue R1) | The Management Operator in the cluster cannot connect to the Rafay Controller. Scenario R1. |
| — | Blueprint sync failure: an add-on does not deploy (catalogue R2) | Add-on version, node disk space, or override conflict. Scenario R2. |
| — | API server or Rafay Controller not reachable, but the nodes run (catalogue P7) | Control-plane VIP or load-balancer fault. Scenario P7. |

## 2. Impact and blast radius

- **Severity:** SEV3 by default. SEV2 when production jobs cannot be scheduled. SEV1 when the Rafay controller or BCM head node is degraded cluster-wide.
- **Priority:** SEV3 is P3 in the P1 to P4 table of [shift-discipline.md](../handbook/shift-discipline.md#1-the-priority): one node or one job class, with a workaround. SEV2 is P2 when many nodes or a partition cannot schedule; SEV1 (control plane) is P1.
- **Blast radius:** one node (`NotReady`, GRES missing) — its jobs and its 8 GPUs. A queue/partition misconfiguration — every job of that job class. A Rafay controller or BCM head-node degradation — **the whole cluster** (jobs keep running; scheduling and control-plane operations stop). A DPS resource-group policy change — power is redistributed across the group's nodes (can take power from other nodes). An alert-storm — observability for the whole fleet.

## 3. First 5 minutes

1. `kubectl get nodes -o wide` or `sinfo -R` `[C:L7]` — expected: nodes `Ready` / present in the queue.
2. `kubectl describe node <node>` or `scontrol show node <node>` `[C:L7]` — expected: allocatable GPUs correct, no unexpected taints; GRES present.
3. `kubectl get workloads -A` or `squeue` `[C:L7]` — expected: jobs queued or running for a known reason.

Dashboards to open: the Rafay/BCM console (cluster health, blueprint sync state) and the Grafana fleet dashboard (dcgm-exporter and node-exporter panels for the affected node).

**Who runs it:** L1 runs steps 1, 2, and 3 (read-only; [l1-primer.md](../handbook/l1-primer.md)). Cordon, drain, resume, reboot, and every configuration change (sections 6 and 7) are L2 or L3.

## 4. Hardware variants

Row names follow [hardware-matrix.md](../handbook/hardware-matrix.md), Table 2.

| | Hopper HGX (H100/H200) | Blackwell HGX (B200/B300) | NVL72 rack (GB200/GB300) | AMD Instinct (MI300X/MI350X/MI355X) |
|---|---|---|---|---|
| Kubernetes operator and resource | NVIDIA GPU Operator, `nvidia.com/gpu` | same | same, plus the DRA driver with ComputeDomains — the drain gate (`kubectl get computedomains,resourceclaims -A`) is NVL72-only | AMD GPU Operator, `amd.com/gpu` |
| Slurm GRES | Slurm GRES page | same | same | none found (hardware-matrix) |
| Failure domain of one scale-up fault | 1 server, 8 GPUs | 1 server, 8 GPUs | up to 1 rack, 72 GPUs — one drain can stop a 72-GPU job | 1 server, 8 GPUs |

The scheduler platform is Rafay for Kubernetes and BCM for Slurm; NVL72 domains add the ComputeDomain/IMEX checks that plain nodes do not have.
The ComputeDomain gate is for Kubernetes only.
On a Slurm NVL72 node, check the IMEX domain with `nvidia-imex-ctl -H -N` `[C:§11.5]` instead.
The DPS and Redfish `NodeManager` checks are for DGX only; on the Dell servers of this fleet, read the power sensors through iDRAC.

## 5. Decision table

| # | Layer | Command | Good looks like | Bad looks like | Next |
|---|---|---|---|---|---|
| 1 | L1 | `ipmitool sensor` and `ipmitool sel list` `[C:L1]`; Dell: `racadm getsensorinfo` `[R]` | No power/thermal events | PSU events; policy error with PSU change | Signature 86 (DGX only): step 2. Dell PSU fault: RB-03 and the Dell case |
| 2 | L1 | DGX or BCM only (vendor doc). DPS read-only: `dpsctl policy bundle list`, `dpsctl policy list` `[X:23]`; Redfish `curl` GET of `.../Managers/BMC/NodeManager/PSUPolicies` and `.../Domains` `[X:23]` | Domain policy limit ≤ active PSU policy limit | `policy capability max cannot be more than active psu policy limit max` | Version/policy alignment: RB-05 (BMC/firmware); change DPS policy only via Repair A6. Dell: not applicable |
| 3 | L1 | `chronyc tracking` and `chronyc sources` `[C:L1]` | Offset small | Large offset (`NotReady` with no other cause) | Time sync fix: L2, or L3 with the enterprise network team ([shift-discipline.md](../handbook/shift-discipline.md#4-the-escalation)); also Scenario P4 and N10 |
| 4 | L2 | `nvidia-smi` on the node `[C:L2]` | GPUs present | Missing GPU | RB-03 |
| 5 | L7 | `kubectl get nodes -o wide` / `sinfo -R` `[C:L7]` | `Ready` / not drained | `NotReady` / `drain`/`down` with a reason | Step 6; `NotReady`: Scenario P4 and N10 |
| 6 | L7 | `kubectl describe node <node>` / `scontrol show node <node>` `[C:L7]` | Allocatable GPUs correct, no unexpected taints; GRES present | Taints (Node Problem Detector), missing GRES, bad conditions | Step 7 |
| 7 | L7 | `kubectl get workloads -A` (Kueue) / `squeue` / `sacct -j <job>` `[C:L7]` | Job queued or running for a known reason | Gang job stuck; job failed with reason | Fix queue/resources, or step 8 |
| 8 | L7 | `kubectl get pods -n gpu-operator` and `kubectl logs -n gpu-operator <driver pod>` `[C:L7]` | Driver, toolkit, device-plugin, DCGM exporter pods `Running` | Driver pod crash-looping after an upgrade | Scenario P2; driver/kernel mismatch: RB-05 |
| 9 | L7 | `kubectl describe pod <pod>` `[C:L7]` | Events show scheduling success | `Pending`/`ContainerCreating`, device claims failing | NVL72: `kubectl get computedomains,resourceclaims -A` `[C:L3]`; blocked multi-node NVLink: RB-01; PVC `Pending`: RB-07 step 10 |
| 10 | L7 | BCM only: `cmsh` → `wlm` → `jobqueue` (list) and `cmsh` → `device` → `list` `[X:22]`; `scontrol show node <node>` | Nodes appear in the intended queue | Empty nodelist (signature 87) | Repair A7 (assign nodes) |
| 11 | L7 | Rafay: `rctl`, `rcollect`, `kubectl get backups -n velero` and `kubectl describe backup -n velero <name>` `[C:L7]`. Run `rcollect` and the Velero commands on the controller cluster, not on a managed cluster | Backups `Completed`; controller healthy | Degraded controller; cluster "not reachable"; blueprint sync failed | Scenarios R1, R2, P7; hand to L3 support, `radm` is L3-only |
| 12 | L8 | `curl -s localhost:9400/metrics \| grep DCGM_FI`, `curl -s localhost:9100/metrics`, `journalctl -k`, `amtool` `[C:L8]` | Exporters respond; alerts match reality | Metric missing; alert storm | Fix exporter; silence with `amtool` (Mitigation A10) during a change |

**Who runs it:** L1 may run steps 5, 6, 7, and 9 (read-only). All other steps are L2 or L3.

### Scenario: P2 — GPU Operator or Network Operator in a crash loop

| # | Layer | Command | Good looks like | Bad looks like | Next |
|---|---|---|---|---|---|
| P2.1 | L7 | `kubectl get pods -n gpu-operator` `[C:L7]` and `kubectl get pods -n nvidia-network-operator` `[R]` (namespaces as installed) | All pods `Running` | A pod in `CrashLoopBackOff` or `Init` | P2.2 |
| P2.2 | L7 | `kubectl logs -n gpu-operator <driver pod>` `[C:L7]`; the device-plugin and Network Operator pod logs: `kubectl logs -n <namespace> <pod> --all-containers` `[R]` | No errors | Driver build or load error; the device plugin finds no GPU; a NIC driver error | P2.3 |
| P2.3 | L1 | `uname -r` `[R]` on the node, against the kernel that the driver image supports | Same kernel as the baseline and the driver image | The kernel changed (an OS update) | RB-05 (driver/kernel mismatch); fix through a new blueprint version (A9), not by hand |

### Scenario: P4 and N10 — node `NotReady`, or `slurmd` does not respond

| # | Layer | Command | Good looks like | Bad looks like | Next |
|---|---|---|---|---|---|
| P4.1 | L7 | `kubectl describe node <node>` `[C:L7]`: the conditions `MemoryPressure`, `DiskPressure`, `PIDPressure` | All `False` | A pressure condition is `True` | L2: free the resource; drain (A2) if it does not clear |
| P4.2 | L1 | `journalctl -u kubelet --since "1 hour ago"` `[R]`; Slurm: `systemctl status slurmd` `[R]` and `journalctl -u slurmd --since "1 hour ago"` `[R]` | kubelet and `slurmd` active, no errors | Certificate or TLS errors; the API server or `slurmctld` not reachable; the service failed | Time: step 3. Network: P4.3. Service restart: L2, after a drain (A2/A3) |
| P4.3 | L1 | Management network: `ping -c 3 <control-plane address>` `[R]` | Answers | No answer, or loss | L2, then the enterprise network team |
| P4.4 | L1 | DNS (N10): `getent hosts <node name>` and `getent hosts <API server name>` `[R]` | The expected addresses | No answer or a wrong address | L2, then L3 with the enterprise network team ([shift-discipline.md](../handbook/shift-discipline.md#4-the-escalation)) |

### Scenario: R1 — cluster shows "not reachable" in Rafay

| # | Layer | Command | Good looks like | Bad looks like | Next |
|---|---|---|---|---|---|
| R1.1 | L7 | The Rafay console: the cluster health signals (reachability, control-plane health) | Reachable, healthy | Not reachable | R1.2 |
| R1.2 | L7 | With the local kubeconfig of the cluster (not ZTKA): `kubectl get pods -n rafay-system` `[R]` (the Management Operator pods; namespace as installed), then `kubectl logs -n rafay-system <pod>` `[R]` | All pods `Running` | A pod in a crash loop or `Pending`; connection errors in the log | R1.3; a pod fault: Rafay support with the log |
| R1.3 | L4 | The path to the controller: `getent hosts <controller name>` `[R]`, `curl -v https://<controller name>` `[R]`, and an MTU test `ping -M do -s <size> <controller address>` `[R]`; the firewall and the proxy rules | Name resolves; TLS connects; large packets pass | DNS failure; TLS or proxy failure; large packets dropped | Firewall, proxy, DNS, MTU: L2, then the enterprise network team |

### Scenario: R2 — blueprint sync failure

| # | Layer | Command | Good looks like | Bad looks like | Next |
|---|---|---|---|---|---|
| R2.1 | L7 | The Rafay console: the sync failure details of the blueprint on the cluster | Synced | Failed, with the add-on name | R2.2 |
| R2.2 | L7 | The add-on version (GPU Operator, Network Operator, monitoring) against the Kubernetes version of the cluster (the platform support page of the add-on); the fleet overrides of the cluster | Supported combination; no conflicting override | Unsupported combination; an override conflict | New blueprint version (A9), L3 |
| R2.3 | L7 | Free disk space: `kubectl describe node <node>` `[C:L7]` (`DiskPressure`) and `df -h /var/lib` `[R]` on the node | Free space | `DiskPressure`; the image file system is full | L2: free the space, then sync again |

### Scenario: P7 — control-plane VIP or load balancer

| # | Layer | Command | Good looks like | Bad looks like | Next |
|---|---|---|---|---|---|
| P7.1 | L7 | `kubectl get --raw='/readyz?verbose'` `[R]` through the VIP, then directly to each control-plane node | `readyz check passed` | Timeout or TLS error through the VIP only | P7.2 |
| P7.2 | L4 | Which node has the VIP: `ip addr show` `[R]` on each control-plane node; the load-balancer health check (for the Rafay Controller: `/healthz/ready`); the TLS offload or passthrough path; DNS of the VIP name | One node has the VIP; the health check passes | No node or two nodes have the VIP; the health check fails | L2, then L3 with the load-balancer owner |

### Read-only diagnostics (by layer)

| Layer | Command | Tag | Look for |
|---|---|---|---|
| L1 | `ipmitool sensor`, `ipmitool sel list`, `chronyc tracking`, `chronyc sources` | `[C:L1]` | Power events, time offset |
| L1 | `dpsctl policy bundle list`, `dpsctl policy bundle get <name>`, `dpsctl policy list`, Redfish GET `.../NodeManager/Domains`, `.../NodeManager/PSUPolicies`, `.../PSUPolicies/{id}` (DGX or BCM only; vendor doc) | `[X:23]` | DPS domain vs PSU policy limits (PSU policies are read-only) |
| L1 | `racadm getsensorinfo` (Dell), `uname -r`, `journalctl -u kubelet`, `systemctl status slurmd`, `getent hosts <name>` | `[R]` | Dell PSU and power sensors; kernel version; kubelet and `slurmd` state; DNS |
| L2 | `nvidia-smi`, `nvidia-smi -q` | `[C:L2]` | GPU presence, power cap |
| L7 | `kubectl get nodes -o wide`, `kubectl describe node <node>`, `kubectl describe pod <pod>`, `kubectl get pods -n gpu-operator`, `kubectl logs -n gpu-operator <driver pod>`, `kubectl get workloads -A` | `[C:L7]` | Node/pod/operator state |
| L7 | `kubectl get pods -n nvidia-network-operator`, `kubectl get pods -n rafay-system`, `kubectl get --raw='/readyz?verbose'` | `[R]` | Network Operator, Rafay Management Operator, API server readiness |
| L7 | `sinfo -R`, `scontrol show node <node>`, `squeue`, `sacct -j <job>` | `[C:L7]` | Slurm node/job state and reasons |
| L7 | `cmsh` (`wlm` → `jobqueue`; `device` → `list`; `device newnodes`) | `[X:22]` | BCM queue/node mapping |
| L7 | `rctl`, `rcollect`, `kubectl get backups -n velero`, `kubectl describe backup -n velero <name>` (on the controller cluster) | `[C:L7]` | Rafay controller/backup state |
| L3/L7 | `kubectl get computedomains,resourceclaims -A` | `[C:L3]` | ComputeDomain and IMEX claims (NVL72) |
| L7 | `kubectl get pvc -A` | `[C:L5]` | PVC state (RB-07) |
| L8 | `curl -s localhost:9400/metrics \| grep DCGM_FI`, `curl -s localhost:9100/metrics`, `journalctl -k`, `amtool` | `[C:L8]` | Metrics and alerts |

### Differential diagnosis

| Looks like | How to tell | Go to |
|---|---|---|
| Hardware fault driving the node `NotReady`/drain reason | Node Problem Detector taint plus Xid in `dmesg` | RB-03 |
| NVLink/IMEX blocking a multi-node job | Pod/claim `Pending`; `nvidia-imex-ctl -H -N` not `READY` | RB-01 |
| Driver/kernel mismatch after upgrade | Driver pod crash loop | RB-05 |
| Storage claim problem | PVC `Pending` (VAST CSI) | RB-07 step 10 |
| DGX Station sizing question (outside this fleet; not a fault) | No error, asks about RAM:VRAM or model size | AI Factory Explorer `<link TBD>` (no runbook) |
| BCM integration (88), BCM CVE update (89), NMC step difference (90) | DGX, BCM, or BasePOD text | No action on this fleet. If BCM or NMC is present: the BCM manual and release notes, L3 |
| SR-IOV/mode question for CX8 | `ibstat` link layer; `mlxconfig` | RB-04 |
| Time skew | `chronyc tracking` large offset | Fix NTP first (L2, or L3 with the enterprise network team) |

## 6. Mitigation

Safety checklist (before any state-changing action, here and in Repair below):

```
- Drain the node / job queue first: `kubectl drain --ignore-daemonsets` or `scontrol update ... State=DRAIN Reason="<ticket>"`.
- On NVL72, verify no active IMEX/ComputeDomain job: `kubectl get computedomains,resourceclaims -A`.
- Restarting `nvidia-fabricmanager` kills every CUDA context on the NVSwitch system.
- BIOS/firmware/BMC changes require a change window; some need AC power cycle.
- Switch fabric changes (`ufm_ha_cluster failover`, `nv config apply`) can drop RoCE/IB sessions.
```

> Every action below needs a ticket ID as the reason (Slurm `Reason="<ticket>"`, or the change record).

The fastest safe actions stop new work landing on the bad node and quiet the alert noise; the Repair section holds the drains, configuration changes, and the return-to-service procedure.

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A1 | Cordon a Kubernetes node `[C:§10]` | `kubectl cordon <node>` | **L2.** `kubectl describe node <node>` read | No new pods scheduled | `kubectl uncordon <node>` |
| A10 | Silence alerts during a change `[C:L8]` `[R]` | `amtool silence add --duration=<t> --comment="<ticket>" <matchers>` `[R]` (add `--alertmanager.url=<url>` if no configuration file sets it) | **L2.** Change record exists; never silence a P1 or P2 alert; the matchers select only the alerts of the change (alert name, node) | Alerts suppressed | `amtool silence expire <silence id>` `[R]` |

## 7. Repair

Remediation ladder: cordon (A1), then drain (A2, A3) → reboot or power cycle (A5) → configuration corrections (A6, A7, A8, A9, change window) → return to service (A4, only after the return-to-service tests pass).

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A2 | Drain a Kubernetes node `[C:§10]` | `kubectl cordon <node>`, then `kubectl drain <node> --ignore-daemonsets` | **L2.** Cordon first (A1). **NVL72:** `kubectl get computedomains,resourceclaims -A` shows no live ComputeDomain job (one drain can stop a 72-GPU job); the job owner agrees; if eviction is blocked (e.g. by a disruption budget) do not force it, ask the job owner | Evicts running pods | `kubectl uncordon <node>` only after return-to-service tests pass (A4) |
| A3 | Drain a Slurm node `[C:§10]` | `scontrol update NodeName=<node> State=DRAIN Reason="<ticket>"` | **L2.** Ticket number in `Reason`. The ComputeDomain check is Kubernetes-only: on a Slurm NVL72 node, read `nvidia-imex-ctl -H -N` `[C:§11.5]` and get the job owner's agreement | Running jobs finish, no new jobs | First read the drain reason: `scontrol show node <node>` `[C:L7]` (`Reason=`). Do not resume a node that auto-remediation or another ticket drained. Then the return-to-service tests (A4), then `scontrol update NodeName=<node> State=RESUME` |
| A4 | Return node to service `[C:§10]` | `kubectl uncordon <node>` or `scontrol update NodeName=<node> State=RESUME` | **L2.** The drain reason is read (not an auto-remediation drain). **Only after** the section 9 tests pass: `dcgmi diag -r 3` (drained node), `dcgmi health -c` `[C:L2]`; Xid and ECC: `dmesg -T \| grep -i xid` `[C:§9]`, `nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE` `[C:L2]`; one node: `NCCL_DEBUG=INFO all_reduce_perf -b 8 -e 8G -f 2 -g <gpus>` `[C:L6]` vs threshold; IB or NVL72 node: `ibstat` `[C:L4]`, `ib_write_bw -d <dev> -a` `[C:L4]`, and a multi-node `mpirun -np <n> -H <hosts> all_reduce_perf ...` `[C:L6]` with a known-good node; NVL72: `nvidia-imex-ctl -H -N` `[C:§11.5]`, `nvidia-smi nvlink -s` `[C:L3]`, `systemctl status nvidia-fabricmanager` `[C:L3]`; VAST: `nfsstat -m` `[C:L5]` and a small write and read on the mount; Kubernetes: `kubectl describe node <node>` `[C:L7]` shows the allocatable GPU and RDMA resources and the labels | Node takes jobs again | Drain again (A2/A3) |
| A5 | Reboot / BMC power cycle `[C:§10]` `[R]` | Reboot: `systemctl reboot` `[R]` on the node. Dell power cycle: `racadm serveraction powercycle` `[R]`. DGX: the BMC power cycle of the vendor doc | **L2.** Drained: `sinfo -R` or `scontrol show node <node>` `[C:L7]` shows `DRAINED` (not `DRAINING`); Kubernetes: `kubectl get pods -A --field-selector spec.nodeName=<node>` `[R]` shows only DaemonSet pods. NVL72: the ComputeDomain check (Kubernetes) or `nvidia-imex-ctl -H -N` `[C:§11.5]` (Slurm); **never on an active IMEX domain without the job owner** | Node jobs stop | None |
| A6 | Change a DPS resource-group power policy (DGX or BCM only; vendor doc) `[X:24]` | `dpsctl resource-group create --resource-group <name> --external-id <n> --policy <p>`; `dpsctl resource-group add --resource-group <name> --entities <nodes>` ; `dpsctl resource-group activate --resource-group <name>` (optionally `--sync`, `--strict-policy`) | **L3.** Save the current DPS state first: the `dpsctl policy bundle list` and `dpsctl policy list` `[X:23]` output in the ticket. Drain the nodes of the group (A2/A3), or the job owners of those nodes agree. Read-only DPS checks done (X23); PSU policy read; change window; BMC/firmware version aligned (RB-05) | Re-provisions power for the group (power can be redistributed from others unless `--allow-reprovision=false`) | Re-apply the previous policy bundle/resource group from the saved output |
| A7 | Assign nodes to a BCM Slurm queue (BCM only) `[X:22]` | In `cmsh`: `wlm` → `jobqueue` → `use <queue>` (check the mode path in the BCM manual); `show` (save the output); then `append computenodes <nodes>` (adds nodes) or `set computenodes <nodes>` (replaces the whole list); then `commit` | **L3.** The saved `show` output of the queue is in the ticket: it is the undo. Prefer `append`: `set` replaces the whole node list | Changes which partition nodes belong to | `set computenodes <list from the saved show output>`, then `commit` |
| A8 | BCM CVE / Local Path Provisioner update (only if BCM-managed Kubernetes is present) `[C:prose-state]` | (no command text beyond the BCM release procedure) | **L3.** Change window; backup (`etcdctl snapshot save <file>` `[C:§10]` for K8s control-plane changes). The Rafay-managed clusters do not use this step: they use the Rafay/Velero backup | Provisioner restarts | Restore from the snapshot/backup |
| A9 | Rafay blueprint version change `[C:§10]` | Rafay blueprint version change (via `rctl`/console) | **L3.** **Canary cluster first**; drift mode "notify" during the roll | Rolls an add-on change to **all clusters on the blueprint** | Roll the blueprint back to the previous version |

## 8. Evidence to collect

Evidence to capture: `sinfo -R`, `scontrol show node <node>`, `kubectl describe node <node>`, `kubectl describe pod <pod>`, `kubectl logs -n gpu-operator <driver pod>`, `rcollect` bundle, `ipmitool sel list`, DPS policy output, `nvidia-bug-report.sh` where a GPU is implicated.

## 9. Return to service

Verify the fix, then run the return-to-service tests (the shared procedure in `_shared/safety-checklist.md`):
1. Drain reason: `sinfo -R` or `scontrol show node <node>` `[C:L7]`, or `kubectl describe node <node>` `[C:L7]`.
   Do not return a node that auto-remediation drained without the owner of that check.
2. GPU health: `dcgmi diag -r 3` `[C:L2]` on the drained node; `dcgmi health -c` `[C:L2]`.
3. Xid and ECC again: `dmesg -T | grep -i xid` `[C:§9]` shows no new Xid; `nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE` `[C:L2]` shows no uncorrectable ECC error and no pending or failed row remap.
4. NCCL inside the node: `NCCL_DEBUG=INFO all_reduce_perf -b 8 -e 8G -f 2 -g <gpus>` `[C:L6]` reaches the acceptance threshold (one node only).
5. IB node: `ibstat` `[C:L4]` shows each port `Active` at the expected rate; `ib_write_bw -d <dev> -a` `[C:L4]` to a known-good node reaches line rate; a multi-node `mpirun -np <n> -H <hosts> all_reduce_perf ...` `[C:L6]` with a known-good node reaches the threshold.
6. NVL72 node: `nvidia-imex-ctl -H -N` `[C:§11.5]` shows all nodes `READY`; `nvidia-smi nvlink -s` `[C:L3]` shows each link up; `systemctl status nvidia-fabricmanager` `[C:L3]` is `active (running)`; a multi-node NCCL run inside the rack reaches the threshold; on Kubernetes, a test ComputeDomain starts.
7. Storage: `nfsstat -m` `[C:L5]` shows the VAST mount with the intended options; write one small file in a test directory on the mount, read it back, and delete it.
8. Kubernetes: `kubectl get nodes -o wide` `[C:L7]` shows `Ready`; `kubectl describe node <node>` `[C:L7]` shows the allocatable GPU resource (nvidia.com/gpu) and the RDMA resources of the hardware and the correct labels (GPU model, driver); `kubectl get pods -n gpu-operator` `[C:L7]` and the Network Operator pods are `Running`.
   Slurm: `scontrol show node <node>` `[C:L7]` shows GRES present.
9. A test job starts and runs; `squeue`/`sacct -j <job>` `[C:L7]` shows normal state.
10. DPS (DGX or BCM only): `dpsctl policy list` `[X:23]` and the Redfish PSU policy read show the domain policy within the active PSU limit.
11. Only then Repair A4.

## 10. Escalation

- **Internal:** L1 hands over to L2 at the end of section 3 with no fix, at once for P1 and P2. L2 hands over to L3 when the runbook ends with no fix, or when the fix needs more than a standard change ([shift-discipline.md](../handbook/shift-discipline.md#4-the-escalation)).
- NVIDIA (BCM/DGX support, DGX or BCM only): `cmsh` output, DPS/BMC/PSU policy reads, BMC firmware versions, `ipmitool sel list`. Dell servers: the Dell case with `racadm techsupreport collect` and `export` (RB-05).
- Rafay: `rcollect` bundle (run it on the controller cluster); controller upgrade/restore (`radm`) is L3-only via the change procedure.
- The enterprise network team: DNS, NTP, the firewall, the proxy (Scenarios P4 and N10, R1).
- RB-05 for BMC/firmware alignment; RB-01 for NVL72 domain issues.

## 11. Customer message

> **SEV1/SEV2 template — platform / scheduling fault:**
> "The <scheduler / control plane> on <cluster> is degraded: job <job-id> (or job class <queue>) cannot be scheduled. Running jobs continue (<verified / not verified yet>); queued jobs are delayed. We are <draining node <node-id> / repairing the control plane> under ticket <ticket-id>. Estimated restoration: <time>. Next update by <time: the update interval of the priority, see shift-discipline.md>."

## Appendix A — Gaps & open questions

- `[GAP:G09]` No read-only command for BMC/BIOS/DPS version read-out in the CLI gist; DPS/Redfish read commands come from vendor docs (X23).
- BCM CVE update steps have no command text; follow the BCM release procedure.
- The `cmsh` mode path of Repair A7 (`wlm` → `jobqueue` → `use <queue>`) and the `computenodes` property name are not confirmed in the BCM manual for your release; check them before the change.
- The AI Factory Explorer link is a placeholder.

## Appendix B — Source trace

| Step / claim | Guide section | Gist / external |
|---|---|---|
| Steps 1-3 | §1 (DPS policy), D (platform), root cause note on time skew | L1 `ipmitool`, `chronyc`; X23; Dell RACADM CLI guide |
| Steps 4-9 | §4, P (Platform/scheduling 1-4) | L7 table; §9 |
| Step 10 | §4, D (`sinfo -R`) | X22; L7 `scontrol show node` |
| Step 11 | §4 (Rafay context in gist) | L7 `rctl`, `rcollect`, velero |
| Step 12 | gist L8 | L8 |
| Scenarios P2, P4/N10, R1, R2, P7 | Catalogue rows P2, P4, P7, R1, R2; shift-discipline escalation table | Kubernetes `kubectl` and API health reference; NVIDIA Network Operator docs; Rafay import and troubleshooting docs (`rafay-system`); systemd and iputils man pages |
| A1-A5 | §4 state-changing, safety checklist | §10; Alertmanager `amtool` README; systemd `systemctl reboot`; Dell `racadm serveraction` |
| A6-A9 | §1, §4 | X24, X22; §10 Rafay blueprint, `etcdctl snapshot save` |
| Section 9 | Catalogue L1, L3; cluster-onboarding.md phases 1 and 2 | L2, L3, L4, L5, L6, L7, §9, §11.5 |
