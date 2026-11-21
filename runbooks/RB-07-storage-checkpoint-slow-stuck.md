---
id: RB-07
title: Storage / checkpoint slow or stuck (L5)
owner_layers: [L5, L4, L6]
severity:
  default: SEV2
  escalate_to: "SEV1 when checkpoints fail for production training, or VAST cluster/VMS is unavailable"
signatures: [80, 81, 82, 83, 84, 85]
guide_refs: ["P (Storage / checkpoint slow or stuck)", "P (Job is slow step 5)"]
gist_refs: ["L5", "L1 (nvme, dmesg)", "L4 (nv show qos roce, ethtool -S)", "L6 (py-spy)", "§9", "§10"]
related:
  upstream: [RB-04, RB-02]
  downstream: [RB-04, RB-08]
  lookalike: [RB-02]
gaps: [G14, G50, G51]
---

# RB-07 — Storage / checkpoint slow or stuck (L5)

The triage guide has **no verbatim storage error strings**; this runbook is symptom-driven from the guide's "Storage / checkpoint slow or stuck" playbook and the L5 gist table. `gdscheck NVMe P2PDMA unsupport` is owned by RB-05.

## 1. Trigger

| # | Symptom (no verbatim string in the guide) | Decoder meaning |
|---|---|---|
| 80 | Checkpoint write slow or stuck; dataloader stall (saw-tooth SM activity) | Data/storage stall, not compute. `py-spy dump --pid` shows the rank blocked in a file read/write. |
| 81 | Client NFS low throughput; multipath options not in use | `nfsstat -m` shows the mount lacks `nconnect`, `vers`, `proto`, `rsize`/`wsize` as intended. |
| 82 | VAST cluster / CNode / VMS issue | `vastpy-cli --json get clusters` is the first VAST command in an incident. |
| 83 | PVC stuck `Pending` (VAST CSI) | Claim not bound: CSI or storage class problem. |
| 84 | Local NVMe failure or slow local cache | Media errors, wear, or tail latency on local NVMe. |
| 85 | RoCE storage slow (PFC/ECN growth on the storage leaf) | Congestion on the lossless storage fabric. |

## 2. Impact and blast radius

- **Severity:** SEV2 by default. SEV1 for failed checkpoints in production training or VAST cluster/VMS unavailable. SEV3 for a single slow client.
- **Priority:** SEV2 is P2 in the P1 to P4 table of [shift-discipline.md](../handbook/shift-discipline.md#1-the-priority) when many clients, a tenant, or the VAST cluster is affected, else P3: one slow client has a workaround.
- **Blast radius:** one client node — its job's checkpoints and dataloader — for a mount/NVMe problem. One tenant — its views and quota — for a tenant-local VAST issue. VMS unavailable — the management plane for **all clients** (data path stays up). A congested storage leaf — every storage client on that leaf. Every restart of a training rank re-runs through a checkpoint, so a slow checkpoint path degrades the whole job.

## 3. First 5 minutes

1. `nfsstat -m` `[C:L5]` — expected: `nconnect`, `vers`, `proto`, `rsize`/`wsize` as intended.
2. `iostat -x 1 5` `[R]` — expected: low queue depth and service time.
3. `vastpy-cli --json get clusters` `[C:L5]` — expected: cluster healthy, client served by expected CNodes.

Dashboards to open: the Grafana GPU dashboard (dcgm-exporter) for the saw-tooth SM activity that says "GPU waiting on data" (signature 80), and the VAST capacity/alerting views for the cluster.

**Who runs it:** L1 runs steps 1 and 2 (read-only; [l1-primer.md](../handbook/l1-primer.md)). Step 3 needs VAST VMS access and is L2.

## 4. Hardware variants

Row names follow [hardware-matrix.md](../handbook/hardware-matrix.md) where they apply; VAST is the storage platform of choice (catalog, V-series).

| | NFS over TCP | NFS over RDMA | Local NVMe cache |
|---|---|---|---|
| Multipath tuning (decision step 5) | `nconnect` = 8 per 100 Gb/s, min 8 | `nconnect` = 2 per 100 Gb/s | n/a |
| Path checks | `ethtool -S` for drops | RDMA counters, `rdma statistic`; RoCE PFC/ECN only on a RoCE leaf | `nvme smart-log`, `dmesg` media errors |

| | NVIDIA GPU nodes | AMD Instinct nodes |
|---|---|---|
| Dataloader-stall signal (saw-tooth SM activity) | `dcgm-exporter` metrics in Grafana (`curl -s localhost:9400/metrics \| grep DCGM_FI` `[C:L8]`) | AMD Device Metrics Exporter (GPU and NIC) |
| Collective/app checks | RB-02 | RCCL/`rccl-tests` equivalents |

## 5. Decision table

| # | Layer | Command | Good looks like | Bad looks like | Next |
|---|---|---|---|---|---|
| 1 | L1 | `dmesg -T \| grep -iE 'xid\|aer\|nvme'` `[C:L1]` | No NVMe/PCIe/Xid errors | NVMe or AER errors | Step 2; GPU Xid: RB-03 |
| 2 | L1 | `nvme list` `[C:L1]`, then `nvme smart-log /dev/<dev>` `[R]` for each device in the list | No media errors, wear low | Media errors or critical warnings | Local-disk hardware: site hardware, evidence below |
| 3 | L1 | `chronyc tracking` `[C:L1]` | Offset small | Large offset (token/TLS oddities) | Fix time sync: L2, or L3 with the enterprise network team (RB-08 step 3) |
| 4 | L4 | `ib_write_bw -d <dev> -a` (RB-04) `[C:L4]` and, for RoCE storage, `nv show qos roce` and `nv show interface <swp> counters qos` `[C:L4]`; `ethtool -S <nic>` `[C:L4]` | Line rate; PFC/ECN flat | PFC/ECN growing, drops | RB-04 |
| 5 | L5 | `nfsstat -m` `[C:L5]`; the VAST NFS client driver version `[GAP:G50]`; the QoS policy of the view or the user in VMS `[GAP:G51]` | `nconnect`, `vers`, `proto`, `rsize`/`wsize` as intended (nconnect = 8 per 100 Gb/s TCP, 2 per 100 Gb/s RDMA, min 8); driver version as in the baseline; no QoS limit below the expected rate | Options missing; old or no VAST NFS driver (no multipath); a QoS policy limits the view or the user | Repair A1; driver: L2 change with the node owner; QoS policy: VAST admin (L3) |
| 6 | L5 | `fio --ioengine=libaio --direct=1 --directory=<test dir> --size=<n> --runtime=<s>` (seq + random) on the mount and on local NVMe `[C:L5]`. **L2 only:** this is a write load on shared production storage. Use a dedicated test directory, limit `--size` and `--runtime`, delete the test files after the run, and tell the tenant first | Bandwidth/latency near the baseline | Mount slow but local NVMe fine | Storage side: steps 8-9. Local also slow: step 7 |
| 7 | L5 | `iostat -x 1 5` `[R]` and `biolatency` (bcc) `[C:L5]` | Low queue depth and service time | Saturated device; tail latency that `iostat` averages away | Device or mount saturated |
| 8 | L5 | `mdtest`, `elbencho` `[C:L5]`; `vperfcheck` `[C:L5]`. **L2 only:** same rules as step 6 (dedicated test directory, size and run-time limits, cleanup, the tenant informed) | Metadata ops/s and write rate at baseline | Metadata storm; low checkpoint write rate | Before filing a VAST ticket, run `vperfcheck` |
| 9 | L5 | `vastpy-cli --json get clusters`, `vastpy-cli get vippools`, `vastpy-cli get views`, `vms list` `[C:L5]` (check the resource names, [command-reference.md](../handbook/command-reference.md)) | Cluster healthy; client served by expected CNodes; the VIPs of the pool are on the expected CNodes | Degraded cluster; VMS unavailable; VIPs moved to other CNodes after a CNode failure or maintenance (V2) | Mitigation A2 (VMS) or VAST support bundle (Repair A3); VIPs moved: step 11 on the clients |
| 10 | L5/L7 | PVC `Pending` (V4): `kubectl get pvc -A` `[C:L5]`, `kubectl describe pvc <pvc> -n <ns>` `[R]`, `kubectl get storageclass <sc> -o yaml` `[R]` (the secret, the storage path, the VIP pool or `vipPoolFQDN`), the VAST CSI controller and node pod logs: `kubectl logs -n <csi namespace> <csi pod> --all-containers` `[R]` (namespace as installed); the view and its quota in VMS (`vastpy-cli get views` `[C:L5]`) | PVC `Bound`; the CSI pods `Running` with no errors | `Pending`; the StorageClass names a wrong secret or VIP pool; CSI errors; no view or quota full | StorageClass or CSI fix: L2. View or quota in VMS: VAST admin (L3). PVC `Bound` but the pod still `Pending`: RB-08 |
| 11 | L5 | Client hang (S4, V2): `ps -eo stat,pid,cmd \| awk '$1 ~ /D/'` `[R]`, `grep -E 'nfs\|vast' /proc/mounts` `[R]`, `dmesg -T \| grep -i 'not responding'` `[R]` | No process in the `D` state on the mount; mounts present; no `not responding` lines | Processes in the `D` state; `server ... not responding` lines; a stale mount | VIPs moved (step 9): wait for the VIP move to complete, then check again. Stale mount: drain (A4), then remount (A1). A CNode fault: VAST support (A3) |
| 12 | L6 | `py-spy dump --pid <pid>` on a rank `[C:L6]` | Rank in compute/NCCL | Rank blocked in a file read/write | Confirms storage; return to steps 5-11 |

**Who runs it:** L1 may run steps 3 and 10 (read-only; in step 10 only the `kubectl` reads `[C:L5]`). All other steps are L2 or L3.

### Read-only diagnostics (by layer)

| Layer | Command | Tag | Look for |
|---|---|---|---|
| L1 | `dmesg -T`, `nvme list`, `nvme smart-log /dev/nvme0`, `chronyc tracking` | `[C:L1]` | Hardware and time |
| L1 | `nvme smart-log /dev/<dev>` (each device of `nvme list`), `dmesg -T \| grep -i 'not responding'` | `[R]` | Each local NVMe; NFS server not responding |
| L4 | `ethtool -S <nic>`, `nv show qos roce`, `nv show qos roce status`, `nv show interface <swp> counters qos` | `[C:L4]` | PFC/ECN/drops on the storage path |
| L5 | `nfsstat -m` | `[C:L5]` | Mount options |
| L5 | `fio`, `mdtest`, `elbencho`, `vperfcheck`, `iostat -x 1`, `biolatency` | `[C:L5]` | Bandwidth, latency, metadata (the write tests are L2 only; see step 6) |
| L5 | `ps -eo stat,pid,cmd \| awk '$1 ~ /D/'`, `grep -E 'nfs\|vast' /proc/mounts` | `[R]` | Processes in the `D` state; NFS mounts present |
| L5 | `vastpy-cli --json get clusters`, `vastpy-cli get vippools`, `vastpy-cli get views`, `vms list` | `[C:L5]` | VAST state |
| L6 | `py-spy dump --pid <pid>` | `[C:L6]` | What a hung rank waits for |
| L7 | `kubectl get pvc -A`, `kubectl describe pod <pod>` | `[C:L5]`, `[C:L7]` | Claim state |
| L7 | `kubectl describe pvc <pvc> -n <ns>`, `kubectl get storageclass <sc> -o yaml`, `kubectl logs -n <csi namespace> <csi pod> --all-containers` | `[R]` | Why a claim stays `Pending` (VAST CSI) |
| L8 | `curl -s localhost:9400/metrics \| grep DCGM_FI` | `[C:L8]` | SM activity saw-tooth (GPU waiting on data); profiling-metric names `[GAP:G14]` |

### Differential diagnosis

| Looks like | How to tell | Go to |
|---|---|---|
| NCCL hang | `py-spy dump` shows the rank in NCCL, not a file call | RB-02 |
| Fabric fault | `ib_write_bw` low or `perfquery -x` errors | RB-04 |
| RoCE congestion on the storage leaf | `nv show interface <swp> counters qos` and `ethtool -S` PFC/ECN growing | RB-04 |
| VAST CSI problem | PVC `Pending` | Step 10 (here) |
| Scheduler problem | PVC `Bound`, but the pod stays `Pending` (no GPU, taint, queue) | RB-08 |
| GPU Xid | `dmesg -T` shows Xid | RB-03 |
| `gdscheck` NVMe P2PDMA unsupported | GDS config/kernel | RB-05 |

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

The fastest safe action restores the storage management plane without touching the data path; client-side and fabric corrections follow in Repair.

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A2 | Move VMS to another CNode `[C:§10]` | `vms modify --preferred-cnode-ids <id>` | **L3.** The VAST admin approves; change record with the ticket; `vms list` `[C:L5]` shows where VMS runs; VMS unavailable. After the move, `vms list` shows VMS on the new CNode | **Management plane only; data path stays up** | `vms modify --preferred-cnode-ids <previous id>`, then `vms list` shows VMS on the previous CNode |

## 7. Repair

Remediation ladder: correct the client mount (A1) → drain before a local-disk or mount change (A4) → storage-fabric QoS fix (A5, change window, coordinate with RB-04) → VAST support bundle for the vendor case (A3).

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A1 | Remount VAST NFS with multipath `[C:prose-state]` `[R]` | Host mount: `umount /mnt/vast` `[R]`, then `mount -o vers=3,nconnect=<n>,spread_reads,spread_writes,remoteports=dns,localports=<range> <vip>:/<export> /mnt/vast`. NFS over RDMA (VAST NFS client): add `proto=rdma,port=20049` to the options `[R]`. CSI mount: change the StorageClass `mountOptions`, then reschedule the pod; never mount by hand under a pod | **L2.** `nfsstat -m` saved; the node is drained (A4), or the job owner agrees and the job is stopped; no process uses the mount | Active I/O on that mount is interrupted | Unmount, then mount with the previous options from the saved `nfsstat -m`; CSI: restore the previous StorageClass |
| A3 | Create a VAST support bundle `[C:L5]` | `supportbundle create --prefix <name> --preset <preset>` (presets: Standard, Performance, NFS, HW, RCA…) | **L2.** Pick the preset matching the symptom | Read-only collection; some load on the cluster | n/a |
| A4 | Drain the node before a local-disk or mount change (RB-08) `[C:§10]` | `kubectl cordon <node>`, then `kubectl drain <node> --ignore-daemonsets`, or `scontrol update ... State=DRAIN Reason="<ticket>"` | **L2.** The job owner agrees; ComputeDomain check on NVL72 | Evicts jobs | Uncordon/RESUME only after the RB-08 return-to-service tests pass (RB-08 A4) |
| A5 | Storage-fabric QoS fix (Cumulus leaf) `[C:§10]` `[R]` | `nv config show -o commands` `[R]` (save the output), `nv config diff -o commands` `[C:L4]`, then `nv config apply --confirm <time>` `[R]`; check the storage path; then `nv config apply --confirm-yes` `[R]` | **L3.** The saved `nv config show -o commands` output is in the ticket; review the diff; change window; coordinate with RB-04 | Storage-fabric changes can drop RoCE sessions | Before the confirm: `nv config apply --confirm-no` `[R]`, or let the timer expire (automatic rollback). After the confirm: `nv config history` `[R]`, then `nv config apply <previous revision>` `[R]` |

## 8. Evidence to collect

Evidence to capture: `nfsstat -m`, `fio` result, `iostat -x 1` sample, `biolatency` histogram, `vperfcheck` output, `vastpy-cli --json get clusters`, `nvme smart-log /dev/nvme0` (each device of `nvme list`), VAST support bundle.
For a PVC or a client hang, also: `kubectl describe pvc <pvc> -n <ns>` `[R]`, the VAST CSI pod logs, and the `ps` and `/proc/mounts` output of step 11.

## 9. Return to service

Verify the fix:
1. `nfsstat -m` shows the intended options.
2. `fio --ioengine=libaio --direct=1` `[C:L5]` on the mount reaches the baseline (step 6 rules: test directory, limits, cleanup); `iostat -x 1 5` `[R]` shows low queue depth.
3. A checkpoint write completes at the expected rate; `py-spy dump --pid` shows no rank blocked in file I/O.
4. `vastpy-cli --json get clusters` healthy; `kubectl get pvc -A` shows `Bound`.
5. A drained node: run the RB-08 return-to-service tests ([RB-08](RB-08-platform-scheduling-slurm-k8s-bcm-power.md), Repair A4) before uncordon or RESUME.

## 10. Escalation

- **Internal:** L1 hands over to L2 at the end of section 3 with no fix, at once for P1 and P2. L2 hands over to L3 when the runbook ends with no fix, or when the fix needs more than a standard change ([shift-discipline.md](../handbook/shift-discipline.md#4-the-escalation)).
- VAST support: `supportbundle create --prefix <name> --preset <preset>` bundle plus `vperfcheck` baseline. Run `vperfcheck` before filing a performance ticket.
- RB-04 for RoCE congestion; RB-08 for a pod that does not schedule after its PVC is `Bound` (the VAST CSI checks are step 10 here).
- Site hardware for failing local NVMe (`nvme smart-log` evidence).

## 11. Customer message

> **SEV1/SEV2 template — storage / checkpoint path degraded:**
> "Checkpoint and data loading for job <job-id> are slow (or stalled) due to a <storage path / VAST / local-disk> issue on <node/cluster>. The job continues at reduced speed and can restart from its last good checkpoint; data loss: <verified none / not verified yet>. We are working the storage path under ticket <ticket-id>. Next update by <time: the update interval of the priority, see shift-discipline.md>."

## Appendix A — Gaps & open questions

- The guide has no verbatim storage error strings (documented above).
- `[GAP:G50]` No confirmed command prints the VAST NFS client driver version on a node; read it from the VAST NFS client documentation for your release, or ask VAST support.
- `[GAP:G51]` No confirmed `vastpy-cli` resource name for QoS policies; read the QoS policy of the view or the user in the VMS Web UI.
- `[GAP:G14]` The cheat sheet says to look at DCGM profiling metrics (SM activity) but no command prints them; use `curl -s localhost:9400/metrics | grep DCGM_FI` and your dashboard.

## Appendix B — Source trace

| Step / claim | Guide section | Gist / external |
|---|---|---|
| Steps 1-3 | P (Storage), P (GPU health 1) | L1 `dmesg -T`, `nvme`, `chronyc` |
| Step 4 | P (Job is slow 3) | L4 |
| Steps 5-9 | P (Storage 1-4) | L5 table |
| Step 10 | P (Storage 4: `kubectl get pvc -A`); catalogue V4 | L5/L7; Kubernetes `kubectl` reference |
| Step 11 | Catalogue S4, V2 | procps `ps`, `proc(5)`, `dmesg` |
| Step 12 | P (Job is hung 1) | L6 `py-spy` |
| A1-A5 | P (Storage), safety checklist | L5 mount row (prose); VAST NFS client mount parameters (`proto=rdma`); §10 `vms modify`, `nv config ...`; NVUE Command Reference (`nv config apply --confirm`, `nv config history`) |
