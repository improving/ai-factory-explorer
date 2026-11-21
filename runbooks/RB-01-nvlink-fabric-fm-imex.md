---
id: RB-01
title: NVLink / NVSwitch / Fabric Manager / IMEX / NVLSM failure
owner_layers: [L3, L2, L1, L7]
severity:
  default: SEV2
  escalate_to: "SEV1 when a multi-node NVLink (NVL72) job cannot start for a whole domain, or Fabric Manager is down on a production NVSwitch node"
signatures: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
guide_refs: ["§8", "§7 (NVSwitch ESXi)", "D (CUDA/driver status codes, Xid 74/149/137, NCCL messages)", "R1", "R2", "P (CUDA/NCCL init failure)"]
gist_refs: ["L3", "L1", "L2", "§9", "§10", "§11.5 (MNNVL)"]
related:
  upstream: [RB-02, RB-03]
  downstream: [RB-03, RB-05, RB-02, RB-08]
  lookalike: [RB-09]
gaps: [G01, G02, G30, G31, G32]
---

# RB-01 — NVLink / NVSwitch / Fabric Manager / IMEX / NVLSM failure

This runbook owns the **Fabric Manager / IMEX health check**. Other runbooks link here for it.

## 1. Trigger

| # | Signature (verbatim) | Decoder meaning |
|---|---|---|
| 1 | `Cuda failure 802 'system not yet initialized'` | Driver says the NVSwitch/NVLink fabric is not ready. Almost always Fabric Manager / NVLSM not loaded or not finished initializing. |
| 2 | `NV_ERR_FABRIC_MANAGER_NOT_PRESENT` | Kernel tried to use the NVLink fabric but Fabric Manager is not present. Same root cause as 802. |
| 3 | `Detected Pre-NVL5 system` | FM startup message when it does not see the expected NVSwitch devices. Wrong FM/driver package, missing switch tray, or missing `ib_umad`/`nvlsm`. |
| 4 | `Cuda failure 800 'operation not permitted'` | Permission denied for a fabric/IMEX handle. On MNNVL check write access to `/dev/nvidia-caps-imex-channels/channel*`. |
| 5 | `Cuda failure 1 'invalid argument'` and `transport/nvls.cc:... NCCL WARN Cuda failure 1 'invalid argument'` / `transport/nvls.cc:... Cuda failure ...` | NVLink multicast (NVLS) memory could not be allocated, often because FM/NVLS is unhealthy. |
| 6 | `healthMask 0xaa` | MNNVL fabric health bitmask: `0b10101010` = 4 of 8 NVLink fabric paths flagged degraded. |
| 7 | `cliqueId <id> state 3` | MNNVL clique in a non-healthy state; check IMEX and Fabric Manager logs. |
| 8 | Xid 74 / 149 | NVLink errors; find the failing link. |
| 9 | Xid 137 (`NVLink TLC RX PRIV`) | Transport-layer parity/privilege fault on an NVLink receiver; can cascade into Xid 94 on several GPUs. |
| 10 | `NVSwitch on H200 passthrough in ESXi` | *Outside this fleet (ESXi hypervisor passthrough; the fleet runs bare-metal HGX and NVL72).* NVSwitch behind hypervisor passthrough; fabric not managed correctly. |
| 11 | Multi-node NVLink job can't start (ComputeDomain / IMEX channel claim) | IMEX domain or channel claim not satisfied (L3/L7). |
| — | Fabric Manager stopped on one node: `systemctl status nvidia-fabricmanager` shows `inactive` (game-day fault of M7) | FM does not run on this node, so CUDA init fails there (802). Decision steps 3-4 give the path: drain, start FM, return to service. |
| — | SXid in the kernel log (NVSwitch error) | The NVSwitch driver reports an NVSwitch error. On HGX the host kernel log shows it. On NVL72 the NVSwitches are in the NVSwitch trays, so the SXid is not in the compute-tray log; confirm with the supplier where you read it (G31). |
| — | A pod of a multi-node NVLink job stays in `ContainerCreating`; event `FailedPrepareDynamicResources` | The kubelet cannot prepare the IMEX channel claim. Often the IMEX daemon pod of the ComputeDomain is not ready on that node. Decision steps 12-14. |

## 2. Impact and blast radius

- **Severity:** SEV2 by default. SEV1 if a whole NVL72 domain cannot start jobs or FM is down on a production NVSwitch node. SEV3 for a single degraded link with no job impact.
- **Priority:** SEV2 is P2 in the P1 to P4 table of [shift-discipline.md](../handbook/shift-discipline.md#1-the-priority): an NVL72 domain or many nodes lose the scale-up fabric.
SEV2 on one HGX node, with a capacity workaround, is P3.
SEV1 is P1; SEV3 is P3.
- **Blast radius, by fault:** one degraded NVLink link — one job on one node. FM/NVLSM/IMEX fault on one node — that node (8 GPUs on HGX; 4 GPUs, one compute tray, on NVL72). Domain-level FM/IMEX fault on NVL72 — one scalable unit: one rack, up to 72 GPUs and every job in it (see [hardware-matrix.md](../handbook/hardware-matrix.md): the failure domain of one scale-up fault is 1 server / 8 GPUs on HGX, up to 1 rack / 72 GPUs on NVL72).

## 3. First 5 minutes

1. `systemctl status nvidia-fabricmanager` `[C:L3]` — expected: `active (running)`.
2. `journalctl -u nvidia-fabricmanager` `[C:L3]` — expected: clean start, no `Detected Pre-NVL5 system`, no device query errors.
3. `nvidia-imex-ctl -H -N` `[C:§11.5]` — expected: all domain nodes `READY`, matrix `C`.

No Fabric Manager unit on the host: the GPU Operator driver container runs FM.
Read the FM state there (decision step 3).

Dashboards to open: the Grafana GPU dashboard for the affected node (dcgm-exporter metrics) and, for fabric counters, the UFM Telemetry dashboards.

**Who runs it:** L1 runs steps 1, 2, 3 (read-only; [l1-primer.md](../handbook/l1-primer.md)), where the access allows. Start, restart, drain, and all other changes are L2.

## 4. Hardware variants

Row names follow [hardware-matrix.md](../handbook/hardware-matrix.md), Table 2. The AMD column for this topic is the catalog's G7 row ("no separate fabric service was found for an 8-GPU Instinct server; to be confirmed").

| | Hopper HGX (H100/H200) | Blackwell HGX (B200/B300) | NVL72 rack (GB200/GB300) | AMD Instinct (MI300X/MI350X/MI355X) |
|---|---|---|---|---|
| Services the scale-up domain needs | Fabric Manager only | Fabric Manager; on B200 and B300 also the NVLink Subnet Manager (NVLSM), which the Fabric Manager package installs; FM needs `ib_umad` | Fabric Manager, NVLSM, IMEX across the compute trays | none found; ask supplier |
| Where FM and NVLSM run | On the host (systemd unit `nvidia-fabricmanager`), or in the GPU Operator driver container (no host unit; FM log `/var/log/fabricmanager.log` in the container) | same; NVLSM runs with FM | The NVSwitches are in the 9 NVSwitch trays, not in the compute trays. The fabric control (FM, NVLSM) is on the switch side (NMX); confirm with the supplier where it runs and how to read its state (G31). IMEX runs on each compute tray: a host service `nvidia-imex`, or on Kubernetes the ComputeDomain daemon pod | not applicable |
| Management CLI | `nvidia-smi` | same | same | `amd-smi` (`rocm-smi` on older fleets) |
| Hardware error signal | Xid events in the kernel log; SXid for NVSwitch errors | same | same; SXid on the NVSwitch trays (G31) | RAS classes `ue`, `ce`, `poison`; no Xid catalogue |
| Collective library and test | NCCL, `nccl-tests` | same | same, with multi-node NVLink | RCCL, `rccl-tests` |
| Failure domain of one scale-up fault | 1 server, 8 GPUs | 1 server, 8 GPUs | up to 1 rack, 72 GPUs (one compute tray: 4 GPUs) | 1 server, 8 GPUs |

NVL72 changes the blast radius from one node to the whole rack: drain decisions and the scheduler topology must use the NVLink domain, not the node.

## 5. Decision table

Layers are non-decreasing. Steps 1-2 rule out hardware first.

| # | Layer | Command | Good looks like | Bad looks like | Next |
|---|---|---|---|---|---|
| 1 | L1 | `dmesg -T \| grep -iE 'xid\|aer\|pcie\|dpc\|nvlink'` `[C:L1]` | No Xid/AER/DPC in the last hour | Xid 79/48/94/95; SXid (the `xid` pattern also matches `SXid`) | Hardware: go to RB-03. Xid 74/137/149 or SXid: continue to step 6 |
| 2 | L2 | `nvidia-smi` `[C:L2]` | All GPUs listed, same driver version as peers | GPU missing, or driver differs from other nodes | Missing GPU: RB-03. Version skew: RB-05 |
| 3 | L3 | `systemctl status nvidia-fabricmanager` `[C:L3]` (the unit also reports the NVLSM process on B200/B300 [X:01]). No host unit (GPU Operator driver container, L2): `kubectl logs -n gpu-operator <driver pod>` `[C:L7]`, `kubectl exec -n gpu-operator <driver pod> -c nvidia-driver-ctr -- nvidia-smi -q` `[R]` (Fabric `State`), `kubectl exec -n gpu-operator <driver pod> -c nvidia-driver-ctr -- cat /var/log/fabricmanager.log` `[R]` | `active (running)`; driver container: Fabric `State` completed | `failed`, `inactive`, restart loop; driver container: Fabric `State` `In Progress` with `CliqueId` `N/A`, or no NVSwitch found in the driver pod log | Step 4. FM stopped on one node (`inactive`) and step 4 shows no error: Repair A4 (drain), then A2 (`systemctl start nvidia-fabricmanager`), then section 9. Driver container: Repair A2 does not apply; escalate to L3 (`[GAP:G32]`) |
| 4 | L3 | `journalctl -u nvidia-fabricmanager` `[C:L3]` | Clean start, no NVSwitch errors | `Detected Pre-NVL5 system`, device query errors | Error lines: step 5. FM stopped and no error in the journal (single-node FM stop): Repair A4 (drain), then A2 (`systemctl start nvidia-fabricmanager` `[R]`), then section 9. If the start fails, continue to step 5 |
| 5 | L3 | `lsmod \| grep ib_umad` `[X:02]` | `ib_umad` listed (B200/B300 need it for FM) | Empty output | Good: step 6; if FM is still stopped, Repair A4, then A2, then section 9. Bad: Repair A1, then re-check step 3. If the FM/nvlsm package is missing or mismatched: RB-05 and `[GAP:G01]` |
| 6 | L3 | `nvidia-smi nvlink -s` `[C:L3]`; DCGM NVLink counters: `dcgmi nvlink -e -g <gpu>` `[R]`, read twice some minutes apart | All links `Active`, error counters 0; DCGM counters do not grow | Inactive links; growing counters | `nvidia-smi nvlink -e` `[X:03]` to see replay/recovery/CRC. Xid 137 with Xid 94 on other GPUs: RB-03 for ECC; link/cable/switch tray goes to escalation |
| 7 | L3 | `nvidia-smi -q \| grep -v GUID \| grep -A4 Fabric` `[C:§11.5]` | Fabric state complete, `cliqueId` identical on all domain nodes | `In Progress` indefinitely, differing `cliqueId` | Step 8 |
| 8 | L3 | `nvidia-imex-ctl -H -N` `[C:§11.5]` | All nodes `READY`, matrix `C` | `UNAVAILABLE` / `I` / `N` / `D` = node down; `V` = driver mismatch between nodes | Down node: repeat steps 3-5 on the down node. Then read its IMEX daemon: host service `systemctl status nvidia-imex` `[R]` and `journalctl -u nvidia-imex` `[R]`; Kubernetes: steps 12-14. `V`: RB-05 |
| 9 | L3 | `ls -l /dev/nvidia-caps-imex-channels/channel*` `[C:§11.5]` | Channel files exist and the job user can write | No files, or no write access | Repair A3 (create) or fix ownership with the job owner |
| 10 | L6 | Re-run the job with `NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,BOOTSTRAP,NET` `[C:L6]` | Init passes | Still `Cuda failure 802/800/1` | FM/IMEX healthy but NCCL fails: RB-02 |
| 11 | L7 | `kubectl get computedomains,resourceclaims -A` `[C:L3]` | ComputeDomain `Ready`, claims allocated | Missing or pending claim; a live domain you are about to disturb | Pending claim or pod in `ContainerCreating`: steps 12-14, then RB-08. Live job: do not restart FM or drain until the job owner agrees |
| 12 | L7 | `kubectl get computedomain <name> -o yaml` `[R]` (`status.nodes`); `kubectl get daemonset --all-namespaces -l "resource.nvidia.com/computeDomain=<cd-uid>"` `[R]`; `kubectl get pods -n <dra-driver namespace> -l resource.nvidia.com/computeDomain` `[R]` | `status` `Ready`; the DaemonSet has desired = ready; one daemon (IMEX) pod `Running` and ready on each node of the domain | Node not in `status.nodes`, or not ready; daemon pod missing, `Pending`, `CrashLoopBackOff`, or not ready | Pod missing on the node: step 13. Pod not ready: read the IMEX daemon log, `kubectl logs -n <dra-driver namespace> <daemon pod>` `[R]`, then Repair A11 |
| 13 | L7 | `kubectl describe node <node>` `[C:L7]`: read the labels; the ComputeDomain label key is `resource.nvidia.com/computeDomain` `[GAP:G30]`. Domain UID: `kubectl get computedomain <name> -o jsonpath='{.metadata.uid}'` `[R]` | The node has the ComputeDomain label with the UID of the domain | No label, or another UID: the DaemonSet does not put the IMEX daemon pod on the node | No label: RB-08 and L3. Do not add the label by hand |
| 14 | L7 | `kubectl describe pod <pod>` `[C:L7]` for the pod in `ContainerCreating`; `kubectl get events --field-selector reason=FailedPrepareDynamicResources --sort-by=.lastTimestamp` `[R]` | No `FailedPrepareDynamicResources` event; the pod starts | `FailedPrepareDynamicResources` events: the claim is not prepared because the IMEX daemon of the node is not ready | IMEX daemon not ready: steps 12-13, then Repair A11. Claim not allocated: RB-08 |

**Who runs it:** L1 may run steps 1-9 and 11-14 (read-only), where the access allows. All other steps are L2 or L3: the driver-container variant of step 3 is L2, and step 10 re-runs a job (L2, the job owner agrees).

### Read-only diagnostics (by layer)

| Layer | Command | Tag | Look for |
|---|---|---|---|
| L1 | `dmesg -T \| grep -iE 'xid\|aer\|pcie\|dpc\|nvlink'` | `[C:L1]` | Xid 74/137/149, PCIe errors |
| L1 | `ipmitool sel list` | `[C:L1]` | PSU/thermal events at the same time as the fabric fault |
| L1 | `lspci -tv` | `[C:L1]` | NVSwitch and GPU devices present |
| L2 | `nvidia-smi` | `[C:L2]` | Driver version, GPU count |
| L2 | `nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE` | `[C:L2]` | ECC growth that follows NVLink errors |
| L3 | `systemctl status nvidia-fabricmanager`, `journalctl -u nvidia-fabricmanager` | `[C:L3]` | Service state and log |
| L3 | `lsmod \| grep ib_umad` | `[X:02]` | Module loaded |
| L3 | `nvidia-smi topo -m` | `[C:L3]` | NVLink path matrix (NV#) between GPUs |
| L3 | `nvidia-smi nvlink -s`, `nvidia-smi nvlink -e` | `[C:L3]`, `[X:03]` | Link state and error counters |
| L3 | `nvidia-imex-ctl -H -N`, `nvidia-smi -q \| grep -v GUID \| grep -A4 Fabric`, `ls -l /dev/nvidia-caps-imex-channels/channel*` | `[C:§11.5]` | IMEX domain, cliqueId, channel permissions |
| L3 | `dcgmi nvlink -e -g <gpu>` | `[R]` | DCGM NVLink error counters; compare two reads |
| L3 | `systemctl status nvidia-imex`, `journalctl -u nvidia-imex` | `[R]` | IMEX host service state and log (not on Kubernetes with the DRA driver) |
| L6 | `NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,BOOTSTRAP,NET <app>` | `[C:L6]` | Which `Cuda failure` line precedes the NCCL error |
| L7 | `kubectl get computedomains,resourceclaims -A` | `[C:L3]` | Domain and claim state |
| L7 | `kubectl logs -n gpu-operator <driver pod>`, `kubectl describe node <node>`, `kubectl describe pod <pod>` | `[C:L7]` | Driver container log (FM start); node labels; pod events |
| L7 | `kubectl get pods -n <dra-driver namespace> -l resource.nvidia.com/computeDomain`, `kubectl logs -n <dra-driver namespace> <daemon pod>` | `[R]` | IMEX daemon pod state and log |

### Differential diagnosis

| Looks like | How to tell | Go to |
|---|---|---|
| Hardware fault (GPU fell off the bus, ECC) | Xid 79/48/94/95 in `dmesg`, or a GPU missing from `nvidia-smi` | RB-03 |
| Xid 94/95 after Xid 137 | Contained/uncontained ECC on several GPUs right after an NVLink parity error; may not raise ECC counters | RB-03 (ECC), stay here for the link |
| NCCL misconfiguration | FM active, IMEX `READY`, channels writable, yet NCCL fails | RB-02 |
| Driver/FM version skew | `nvidia-imex-ctl` shows `V`, or FM refuses to start after an upgrade | RB-05 |
| Linker "nvlink fatal" | A build-time message from the CUDA linker, never the fabric | RB-09 |
| MNNVL SIGSEGV at `world_size >= 44` with `healthMask 0xaa` | `0xaa` is the fabric symptom (here). The 43→44 rank SIGSEGV itself is a known NCCL bug owned by RB-02 | RB-02 |

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

Mitigation actions stop the customer impact fast but are **not root-cause fixes**; the Repair section holds the correction.

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A5 | NCCL workaround: disable NVLS `[E]` (same row family as RB-02 A3, which owns NCCL env workarounds) | `NCCL_NVLS_ENABLE=0 <app>` | **L2.** The job owner agrees. Evidence captured; `transport/nvls.cc` failure confirmed | Job loses in-switch reduction (slower collectives). Not a root-cause fix | Unset the variable |
| A6 | NCCL workaround: disable MNNVL `[E]` | `NCCL_MNNVL_ENABLE=0 <app>` | **L2.** The job owner agrees. Evidence captured; fabric symptom (`healthMask`, SIGSEGV at scale) confirmed | Job falls back to IB/RoCE between nodes (slower). Not a root-cause fix | Unset the variable |
| A7 | NCCL workaround: disable cuMem `[E]` | `NCCL_CUMEM_ENABLE=0 <app>` | **L2.** The job owner agrees. Single-node PCIe (no NVLink) cuMem hang suspected | Loses cuMem features needed by NVLS/MNNVL windows | Unset the variable |

## 7. Repair

Remediation ladder: retry the module (A1) → start or restart the service (A2) → recreate the IMEX daemon pod (A11, Kubernetes) → recreate the channel (A3) → package realignment (A9, change window) → reboot or power cycle (A8) → RMA via escalation. Drain (A4) gates every destructive step and the return to service; A10 keeps the NVLink counter evidence (no reset).

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A1 | Load `ib_umad` so FM can start on B200/B300 `[X:02]` | `modprobe ib_umad` | **L2.** `lsmod \| grep ib_umad` is empty and `journalctl -u nvidia-fabricmanager` shows the FM start failure | Kernel module load only; FM start comes next (A2). The load does not persist across a reboot: list `ib_umad` in a file in `/etc/modules-load.d/` `[R]` through the node image or a change (RB-05) | `modprobe -r ib_umad` `[X:28]`. The unload fails while FM, UFM, or a diagnostic tool holds the module (`lsmod` use count above 0); stop them first, or leave the module loaded |
| A2 | Start or restart Fabric Manager `[C:§10]` | `systemctl restart nvidia-fabricmanager`; FM stopped (`inactive`): `systemctl start nvidia-fabricmanager` `[R]` | **L2.** Node drained (A4), also when FM is already stopped; host unit only (GPU Operator driver container: `[GAP:G32]`); `kubectl get computedomains,resourceclaims -A` shows no live IMEX job; job owner informed. If the node is not under Kubernetes/Slurm, have the job owner stop the jobs first | **Kills every CUDA context on the NVSwitch system.** On NVL72 a restart can stop a 72-GPU job | None: contexts are lost, restart the jobs. Check `systemctl status nvidia-fabricmanager` afterwards |
| A3 | Create IMEX channel node(s) `[X:05]` | `grep nvidia-caps-imex-channels /proc/devices` to get `<major>`, then `mkdir /dev/nvidia-caps-imex-channels` and `mknod /dev/nvidia-caps-imex-channels/channel0 c <major> 0`. Alternative: driver module parameter `NVreg_CreateImexChannel0=1`. Legacy: `nvidia-modprobe -s -i <start:number of minors>` | **L2.** `ls -l /dev/nvidia-caps-imex-channels/channel*` shows no files; agree the channel/user mapping with the job owner (IMEX isolates by user). If `/proc/devices` has no `nvidia-caps-imex-channels` entry, the driver has IMEX channels disabled (open-gpu-kernel-modules module parameter `NVreg_ImexChannelCount`); use the module-parameter alternative or ask the platform team | Grants the channel's users access to the IMEX domain. Channels do not persist across reboot | Remove the node: `rm /dev/nvidia-caps-imex-channels/channel0` `[X:28]` |
| A4 | Drain the node (see RB-08, shared procedure) `[C:§10]` | `kubectl drain --ignore-daemonsets` or `scontrol update ... State=DRAIN Reason="<ticket>"` | **L2.** ComputeDomain check done | Evicts or stops the node's jobs; on NVL72 one drain can stop a 72-GPU job | `kubectl uncordon` / `scontrol update ... State=RESUME` only after return-to-service tests pass (RB-08) |
| A8 | Reboot or BMC power cycle `[C:§10]` | Reboot / BMC power cycle | **L2.** Node drained; **never on an active IMEX domain without the job owner**; change window | All jobs on the node stop | None. Verify with the checks in section 9 |
| A9 | Align FM, driver and nvlsm package versions `[GAP:G01]` | (no command text) | **L3.** `nvidia-imex-ctl -H -N` shows `V`, or FM refuses to start after upgrade | Package change on a production node; change window | Reinstall previous package set |
| A10 | Keep the NVLink error counters; do not reset them `[X:03]` | No reset. Record `nvidia-smi nvlink -e` `[X:03]` and `dcgmi nvlink -e -g <gpu>` `[R]` now and again later; use the deltas | **L3.** Only L3 decides on a counter reset, and only after the counters are in the ticket (section 8). A reset destroys evidence | None (read-only) | n/a |
| A11 | Recreate the IMEX daemon pod of the node (Kubernetes ComputeDomain) `[R]` | `kubectl delete pod -n <dra-driver namespace> <daemon pod>`; the DaemonSet creates a new pod. Host service instead of the DRA driver: `systemctl restart nvidia-imex` `[R]` | **L2.** Decision steps 12-14 show the daemon of this node not ready; its log is in the ticket; `kubectl get computedomains,resourceclaims -A` shows no live job in this domain, or the job owner agrees | The IMEX daemon of the node restarts; jobs of the ComputeDomain lose the IMEX connection to this node | None; the DaemonSet recreates the pod. Check decision step 12 again |

## 8. Evidence to collect

Capture before changing anything: `journalctl -u nvidia-fabricmanager`, `nvidia-smi nvlink -s`, `nvidia-smi nvlink -e`, `nvidia-imex-ctl -H -N`, `dmesg -T` filtered for Xid, `kubectl get computedomains,resourceclaims -A`, `nvidia-bug-report.sh`.
Also: `dcgmi nvlink -e -g <gpu>` `[R]` for each GPU, the IMEX daemon log (`journalctl -u nvidia-imex` `[R]`, or `kubectl logs -n <dra-driver namespace> <daemon pod>` `[R]`), and `kubectl describe pod <pod>` `[C:L7]` of a pod in `ContainerCreating`.

## 9. Return to service

1. `systemctl status nvidia-fabricmanager` shows `active (running)` and `journalctl -u nvidia-fabricmanager` shows no errors.
2. `nvidia-smi -q | grep -v GUID | grep -A4 Fabric` shows completed fabric state with the same `cliqueId` on all domain nodes.
3. `nvidia-imex-ctl -H -N` shows all nodes `READY`.
4. `NCCL_RUN_DIAGNOSTICS=1 <app>` prints `NCCL DIAG [OK]` (see RB-02), then `dcgmi diag -r 3` on the drained node before return (RB-08).
   The diagnostics need NCCL ≥ 2.31; otherwise run `NCCL_DEBUG=INFO all_reduce_perf -b 8 -e 8G -f 2 -g <gpus>` `[C:L6]` against the acceptance threshold.
5. On Kubernetes: the IMEX daemon pod of the node is `Running` and ready (decision step 12).

## 10. Escalation

- **Internal:** L1 hands over to L2 at the end of section 3 with no fix, at once for P1 and P2. L2 hands over to L3 when the runbook ends with no fix, or when the fix needs more than a standard change ([shift-discipline.md](../handbook/shift-discipline.md#4-the-escalation)).
- Escalate to NVIDIA support when: FM fails after packages and `ib_umad` are correct; `healthMask` stays degraded after cable/tray checks; Xid 137/74/149 repeat on the same link.
- Hand off to the on-site data-center hardware team for link/cable/switch-tray replacement (layer L1). On NVL72, an SXid or a switch-tray fault goes to the supplier.
- Attach: `nvidia-bug-report.sh` output, FM journal, IMEX status, NVLink counters, `dmesg -T` Xid lines, `ipmitool sel list`, and on Dell `racadm techsupreport collect` + `export`.

## 11. Customer message

> **SEV1/SEV2 template — fabric service fault (NVL72):**
> "We are investigating a Fabric Manager / NVLink fabric fault on <node / NVL72 domain <domain-id>> that is preventing job(s) <job-id(s)> from starting. Impact: up to one NVL72 rack (72 GPUs); your job may be delayed or restarted. Current action: <service restart under ticket <ticket-id> / node drain in progress>. Cause: <verified / not verified yet>. Next update by <time: the update interval of the priority, see shift-discipline.md>."

## Appendix A — Gaps & open questions

- `[GAP:G01]` No read-only package/version query (`dpkg`/`rpm`/`apt`) in the gist, so FM/driver/NVLSM package skew cannot be proved from this runbook alone. Use `nvidia-smi` for the driver version and `nvidia-imex-ctl -H -N` (`V`) as an indirect signal.
- `[GAP:G02]` *Outside this fleet (ESXi hypervisor).* No hypervisor (ESXi passthrough) tooling. Signature 10 is limited to `nvidia-smi topo -m` and `systemctl status nvidia-fabricmanager` inside the guest.
- The IMEX channel command (A3) is from the NVIDIA IMEX guide; confirm channel numbering with your platform team.
- `[GAP:G30]` No vendor page names the ComputeDomain node label.
  The DRA driver docs use `resource.nvidia.com/computeDomain=<cd-uid>` as the selector of the daemon DaemonSet and pods.
  Confirm with the supplier that the node label has the same key.
- The two NVIDIA pages give different namespaces for the DRA driver (nvidia-dra-driver-gpu and dra-driver-nvidia-gpu); this runbook writes `<dra-driver namespace>`.
  Read the namespace in your Rafay blueprint.
- `[GAP:G31]` On NVL72, the NVSwitches are in the NVSwitch trays.
  No vendor page that opened says where FM and NVLSM run (NMX on the switch side is expected) or where the SXid log is.
  Confirm with the supplier, and add the read-only commands here.
- `[GAP:G32]` No confirmed procedure to start or restart FM when it runs in the GPU Operator driver container.
  Do not restart the driver pod for this; escalate to L3.

## Appendix B — Source trace

| Step / claim | Guide section | Gist / external |
|---|---|---|
| Steps 1-2 hardware gate | Guide R4, D (Xid) | L1 `dmesg -T`; L2 `nvidia-smi`; rule "bottom-up" §0 |
| Steps 3-4 FM state/log | §8, R1, P (CUDA/NCCL init 1) | L3 `systemctl status`, `journalctl -u` |
| Step 5 `ib_umad` | §5 (`modprobe ib_umad`), D (`Detected Pre-NVL5`) | X02 (external) |
| Step 6 NVLink counters | D (Xid 74/149/137) | L3 `nvidia-smi nvlink -s`; X03 |
| Steps 7-9 IMEX | R2, D (800, cliqueId), P (CUDA/NCCL init 2-3) | §11.5 MNNVL table |
| Step 10 NCCL re-run | P (init failure 4) | L6 |
| Step 11 ComputeDomain | safety checklist | L3, L7, §10 |
| Steps 12-14 ComputeDomain daemon, node label, `ContainerCreating` | runbook catalogue G7 | L7 `kubectl describe node/pod`; DRA driver docs (dra-driver-nvidia-gpu.sigs.k8s.io, ComputeDomain workloads; GPU Operator `dra-cds`) |
| Step 3 GPU Operator variant | P (CUDA/NCCL init 1) | L7 `kubectl logs`; GPU Operator troubleshooting ("system not yet initialized") |
| Step 6 DCGM counters, A10 | D (Xid 74/149) | DCGM `dcgmi nvlink` reference |
| A11 IMEX daemon pod | safety checklist | DRA driver docs; L7 |
| A2 FM restart | §8, safety checklist | §10 |
| A5-A7 workarounds | §8 (state-changing fixes) | env gist `[E]` |
