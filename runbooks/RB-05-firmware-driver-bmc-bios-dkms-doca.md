---
id: RB-05
title: Firmware / driver / BMC / BIOS / DKMS / DOCA-OFED regression
owner_layers: [L1, L2, L4]
severity:
  default: SEV2
  escalate_to: "SEV1 when a kernel oops or driver regression affects RDMA traffic on production nodes, or a node will not boot after an upgrade"
signatures: [61, 62, 63, 64, 65, 66, 67, 68, 69]
guide_refs: ["§1", "§2 (DMA-BUF)", "§4 (CX5 Ex PCIe)", "§5", "§6 (CX7 hotplug)", "§7 (upgrade paths)", "§9 (Dell wiki)", "R4", "G summary row 5"]
gist_refs: ["L1", "L2", "L4", "§10", "vendor add-on racadm"]
related:
  upstream: [RB-01, RB-03, RB-04, RB-08]
  downstream: [RB-06]
  lookalike: [RB-06, RB-04]
gaps: [G01, G08, G09, G15, G43, G44, G45]
---

# RB-05 — Firmware / driver / BMC / BIOS / DKMS / DOCA-OFED regression

## 1. Trigger

| # | Signature (verbatim) | Decoder meaning |
|---|---|---|
| 61 | `kernel oops with rcprdma` (DOCA 3.4→3.5 regression on ConnectX-5/ConnectX-6; CX4 unaffected) | *Outside this fleet (ConnectX-5/ConnectX-6; the fleet uses ConnectX-7/8).* New DOCA release breaks existing NFS-over-RDMA. Roll back and open a support case before workarounds. |
| 62 | DOCA 3.5.0 DKMS installer fails to build on `RHEL 9.8 kernel 5.14.0-687.25.1` | Kernel/DKMS incompatibility; headers or kernel not supported by that DOCA release. |
| 63 | DOCA-OFED 3.4.0 repository `SSL Handshake Failure on Debian 13 (Trixie)` | *Outside this fleet (Debian).* Repo TLS failure; check the CA/TLS stack. |
| 64 | `gdscheck` result shows `NVMe P2PDMA unsupport` | GPUDirect Storage cannot use NVMe P2PDMA: kernel/driver/platform limitation. |
| 65 | `DMA-BUF not supported` (RTX 5090 with open kernel module) | *Outside this fleet (consumer GPU).* Open-kernel-module limitation on some GPUs; GDRDMA paths may need DMA-BUF support or a proprietary driver. |
| 66 | ConnectX-5 Ex: `PCIe Gen4 equalization completes but speed change to 16GT/s never asserted` | *Outside this fleet (ConnectX-5 Ex, PCIe Gen4).* Link stays at 8GT/s: hardware/firmware PCIe edge case that looks like a software misconfiguration. |
| 67 | ConnectX-7 NICs disappear after system update: `cx7-pcie-hotplug driver issue` | DPC (Downstream Port Containment) or hotplug event after a platform update. |
| 68 | Reboot with no kernel log; suspected BMC/BIOS/firmware fault | Check BMC event log and Dell/NVIDIA evidence. |
| 69 | Firmware/BMC/BIOS update or QM9700/MLNX-OS upgrade path questions | Change-management procedure, not an incident. |
| — | Xid 119 or Xid 120 (GSP timeout, GSP error); Xid 109 (context switch timeout) in the kernel log | GPU System Processor (GSP) firmware or driver fault (catalogue G4). Compare the driver version with the approved release matrix (steps 8 and 15). |
| — | Node does not boot, or iDRAC/BMC is not reachable | Catalogue G9. Read the iDRAC state, the console, and the SEL (steps 3 to 5). |
| — | Driver, CUDA, or firmware version differs from the approved release matrix after an upgrade; GPU Operator driver pod not `Running` | Catalogue G10. Compare with the matrix, not only with peer nodes (steps 6, 15, and 19). |

## 2. Impact and blast radius

- **Severity:** SEV2 by default. SEV1 for a kernel oops on production RDMA nodes or a node that will not boot after an upgrade. SEV3 for a build failure on a node not yet in service.
- **Priority:** SEV2 is P3 in the P1 to P4 table of [shift-discipline.md](../handbook/shift-discipline.md#1-the-priority): one node is affected and the other nodes carry the work.
  It is P2 when a fleet change hits many nodes.
- **Blast radius:** one node — its GPUs (8 on HGX, 4 on an NVL72 compute tray) and all its RDMA traffic — for driver/DKMS/firmware regressions. A switch/NVOS change affects the **fabric** (every job on it). A bad change pushed fleet-wide affects **every node that took it**; contain with the canary group (hardware-matrix: one upgrade canary group per vendor).

## 3. First 5 minutes

1. `ipmitool sel list` `[C:L1]` — expected: no new PSU/thermal/BIOS/DPC events near the change.
2. `dmesg -T | grep -iE 'dpc|pcie|mlx5|nvlink|oops|call trace|bug:|rcprdma'` `[C:L1]` — expected: no oops, DPC, or PCIe errors.
3. `uname -r` + `dkms status` `[X:13]` — expected: kernel supported by the installed DOCA; DKMS modules `installed`.

Dashboards to open: the Grafana GPU dashboard (dcgm-exporter) for the affected node, and the UFM Telemetry dashboards if fabric counters changed after the upgrade.

**Who runs it:** L1 runs steps 1, 2, and 3 (read-only; [l1-primer.md](../handbook/l1-primer.md)). When a step needs root on the node and L1 has no root access, L2 runs it.

## 4. Hardware variants

Row names follow [hardware-matrix.md](../handbook/hardware-matrix.md), Table 2. The AMD row is the catalog's G10 mapping (driver/CUDA/firmware mismatch).

| | Hopper HGX (H100/H200) | Blackwell HGX (B200/B300) | NVL72 rack (GB200/GB300) | AMD Instinct (MI300X/MI350X/MI355X) |
|---|---|---|---|---|
| Management CLI | `nvidia-smi` | same | same | `amd-smi` (`rocm-smi` on older fleets) |
| Compatibility authority | driver/CUDA matrix | same | same | the ROCm compatibility matrix |
| Kubernetes operator | NVIDIA GPU Operator | same | same, plus the DRA driver | AMD GPU Operator |
| Upgrade canary | one canary group for NVIDIA (driver, CUDA, Fabric Manager) | same | same | one canary group for AMD (ROCm) |
| Health and diagnostics | DCGM, `dcgmi diag` | same | same | ROCm Validation Suite / Cluster Validation Suite |
| Server firmware update path | DGX only: `nvfwupd` (A5) | Dell XE9780/XE9785: iDRAC Lifecycle Controller with a pinned firmware repository (A10); DGX only: `nvfwupd` (A5) | ask the supplier (A11) | ask supplier |
| PCIe generation of the NICs | ask supplier | ConnectX-7: Gen5 (32GT/s); ConnectX-8: Gen6 (64GT/s) | same | ask supplier |

NIC-generation deltas (guide §5): the `rcprdma` oops hits ConnectX-5/ConnectX-6; CX4 is unaffected (signature 61). The CX7 hotplug/DPC disappearance (signature 67) is a platform-update edge case. B300 servers carry 8 ConnectX-8 SuperNICs, one per GPU — a per-NIC regression on B300 costs a full GPU rail, not just storage traffic.

## 5. Decision table

| # | Layer | Command | Good looks like | Bad looks like | Next |
|---|---|---|---|---|---|
| 1 | L1 | `ipmitool sel list` `[C:L1]` | No new events near the change | PSU, thermal, BIOS, DPC events | Hardware alarm: site hardware; GPU effects: RB-03 |
| 2 | L1 | `ipmitool sensor` `[C:L1]` | Normal temps/voltages | Alarm | Same |
| 3 | L1 | Node does not boot or the OS is not reachable: `racadm getsysinfo` `[R]` from the management host | iDRAC answers; the host power state is `ON` | No answer from iDRAC | iDRAC answers: step 4. No answer: ask the site to check the iDRAC network port. iDRAC hangs: Repair A13 (iDRAC reset) |
| 4 | L1 | Console: `ipmitool sol activate` `[R]` (over the LAN, add `-I lanplus -H <bmc> -U <user>`), or the iDRAC virtual console | Boot messages reach the OS login | Stops in POST or UEFI; no output; a kernel panic | Save the console log; step 5; Dell case (section 10) |
| 5 | L1 | `racadm getsel` `[R]` (works when the host OS is down) | No new events near the failure | CPU, memory, PSU, PCIe, or BIOS events | Hardware event: Dell case with `racadm techsupreport collect` `[C:L1]`. Host power cycle only after the evidence is saved (Repair A6) |
| 6 | L1 | `racadm getversion` and `racadm swinventory` `[R]` | BIOS, iDRAC, and component firmware match the approved release matrix | Version differs from the matrix | Firmware update: Repair A10 (Dell), A5 (DGX only), or A11 (NVL72 tray); use the rolling upgrade in section 7 |
| 7 | L1 | `dmesg -T \| grep -iE 'dpc\|pcie\|mlx5\|nvlink\|oops\|call trace\|bug:\|rcprdma'` `[C:L1]` | No oops, DPC, or PCIe errors | `Oops`, `Call Trace`, `BUG:`, rcprdma oops, DPC, mlx5 errors | Oops: rollback path (Mitigation A1). DPC/NIC missing: step 9. `wait_fw_init` or error -16: step 11 |
| 8 | L1 | `dmesg -T \| grep -iE 'xid'` `[C:L1]`; look for Xid 119, 120 (GSP timeout, GSP error) and Xid 109 (context switch timeout) | No Xid 119, 120, or 109 | One of these Xids, often after a driver change | Step 15 (driver against the matrix). Then Repair A2 (roll back or align the driver) and an NVIDIA case with `nvidia-bug-report.sh` `[C:L2]`. Other Xids: RB-03 |
| 9 | L1 | `lspci -tv` `[C:L1]` | NIC and GPU present | NIC missing after update (signature 67) | Reboot after drain (Repair A7); if still missing escalate |
| 10 | L1 | `lspci -vvv -s <bdf>` `[R]`; compare `LnkSta` with `LnkCap` of the same device | `LnkSta` speed and width equal `LnkCap` (ConnectX-7: 32GT/s; ConnectX-8: 64GT/s) | `LnkSta` below `LnkCap` (the pattern of signature 66) | Hardware/firmware PCIe issue: escalate with `lspci -vvv` output |
| 11 | L1 | Plain ConnectX (no Arm cores, no rshim) with `wait_fw_init` or `mlx5_load_one` error -16: `flint -d <dev> q` `[X:12]` and `mlxfwreset -d <dev> query` `[X:11]` | `flint` reads the firmware; the version matches the matrix; `query` lists the reset levels | `flint` cannot read the device; firmware differs from the matrix | Firmware reset: Repair A3. Wrong firmware: Repair A12, then A3. Still failing: host power cycle (Repair A6), then NVIDIA/Dell case. A BlueField DPU: RB-06 |
| 12 | L1 | `uname -r` and `dkms status` `[X:13]`; on a build error, read `/var/lib/dkms/<module>/<version>/build/make.log` | Kernel supported by the installed DOCA; DKMS modules `installed` | DKMS build error; unsupported kernel (signature 62) | DOCA/kernel alignment: Mitigation A1 or Repair A2 |
| 13 | L1 | `/opt/mellanox/doca/tools/doca-info` `[X:12]` and `flint -d <dev> q` `[X:12]` | DOCA/OFED, MFT, firmware as per the approved release matrix | Version differs from peers or from the matrix | Align (Mitigation A1; NIC firmware: Repair A12, then A3) |
| 14 | L1 | `chronyc tracking` and `chronyc sources` `[C:L1]` | Offset small | Large offset (a cause of TLS failures) | Repair A9, then retry the repo |
| 15 | L2 | `nvidia-smi` `[C:L2]` | Driver version equals the approved release matrix and the peers | Driver differs from the matrix or from the peers | Repair A2 |
| 16 | L4 | `ibstat` and `rdma statistic` `[C:L4]`/`[C:§11.4]` | Ports `Active`; counters clean | Port down or retry errors after the change | RB-04; after a switch or MLNX-OS upgrade, the switch rollback (Repair A8) |
| 17 | L4 | `ib_write_bw -d <dev> -a` `[C:L4]` | At line rate | Slow after the change | RB-04; if only after firmware/OFED change, rollback Mitigation A1, or Repair A12 then A3 |
| 18 | L5 | GDS: `gdscheck -p` `[X:15]` and `nvme list` `[C:L1]` | NVMe supported via P2PDMA or nvfs | `NVMe P2PDMA : Unsupported` | Kernel/platform requirements (below), Repair A4 |
| 19 | L7 | `kubectl get pods -n gpu-operator` `[C:L7]` (namespace as installed) | Driver, toolkit, device plugin, and DCGM exporter pods `Running`; the driver version matches the matrix | Driver pod in `CrashLoopBackOff`; wrong driver version | `kubectl logs -n gpu-operator <driver pod>` `[C:L7]`; Repair A2 |

**Who runs it:** L1 may run steps 1, 2, 7, 8, 9, 12, 14, 15, and 19 (read-only). All other steps are L2 or L3.

GDS P2PDMA requirements (GPUDirect Storage docs, X15): CUDA ≥ 12.8; kernel ≥ 6.2 (Ubuntu 22.04) or 5.14 (RHEL 9.4) on x86_64; not supported on RHEL 9.5 x86; can fail with KASLR enabled (`nokaslr`).

### Read-only diagnostics (by layer)

| Layer | Command | Tag | Look for |
|---|---|---|---|
| L1 | `ipmitool sensor`, `ipmitool sel list` | `[C:L1]` | BMC alarms/events |
| L1 | `racadm getsysinfo`, `racadm getsel`, `racadm getversion`, `racadm swinventory` | `[R]` | iDRAC reachable; SEL when the host OS is down; BIOS, iDRAC, and firmware versions |
| L1 | `dmesg -T`, `journalctl -k` | `[C:L1]`, `[C:L8]` | Oops, DPC, PCIe, mlx5 |
| L1 | `lspci -tv`, `lspci -vvv` | `[C:L1]` | Device presence and negotiated link |
| L1 | `uname -r`, `dkms status` | `[X:13]` | Kernel/DKMS state |
| L1 | `/opt/mellanox/doca/tools/doca-info`, `flint -d <dev> q` | `[X:12]` | DOCA/OFED/MFT/firmware versions |
| L1 | `mlxfwreset -d <dev> query` | `[X:11]` | Which firmware reset levels the platform supports |
| L1 | `chronyc tracking`, `chronyc sources` | `[C:L1]` | Time sync |
| L1 | `nvme list`, `nvme smart-log /dev/nvme0` | `[C:L1]` | Local NVMe health |
| L1 | `racadm techsupreport collect` + `export` | `[C:L1]` | SupportAssist evidence for an RMA case |
| L2 | `nvidia-smi` | `[C:L2]` | Driver version |
| L4 | `ibstat`, `rdma statistic`, `ib_write_bw -d <dev> -a` | `[C:L4]` | RDMA health after the change |
| L1/L5 | `gdscheck -p` | `[X:15]` | GDS platform support |
| L7 | `kubectl get pods -n gpu-operator`, `kubectl logs -n gpu-operator <driver pod>` | `[C:L7]` | Driver pod state and version |

### Differential diagnosis

| Looks like | How to tell | Go to |
|---|---|---|
| Fabric/cable fault | `iblinkinfo`/`perfquery -x` show errors while versions match peers | RB-04 |
| BlueField firmware init failure (`wait_fw_init`, `-16`) | Device is a BlueField DPU (Arm cores, an rshim device). A plain ConnectX: step 11 | RB-06 |
| GPU hardware fault | Xid 79/48 or ECC growth | RB-03 |
| Power-policy conflict (DPS) | `policy capability max cannot be more than active psu policy limit max` | RB-08 |
| FM start failure after driver upgrade | FM log shows missing `ib_umad`/NVLSM or version skew | RB-01 |
| Not an incident | Upgrade-path question (signature 69) | Change procedure |

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

The fastest safe action for a regression is to return the node to the last known-good release; the Repair section then holds the full correction.

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A1 | Roll back DOCA/OFED to the last known-good release `[X:14]` | Procedure (DOCA-Host Installation and Upgrade guide): remove the installed DOCA/MLNX_OFED, install the target version from its repo, then `/etc/init.d/openibd restart` and `mst restart`. DKMS and matching kernel headers are required. After the rollback, `flint -d <dev> q` `[X:12]` must show the NIC firmware of the approved release matrix for that DOCA release; if not, Repair A12, then A3 | **L2.** Node drained (RB-08 shared procedure); `doca-info` output saved; support case opened for the `rcprdma` oops | **Affects all RDMA traffic on the node**; reload of RDMA modules | Reinstall the previous release the same way |

## 7. Repair

Remediation ladder: fix the repo/TLS blocker (A9) → align driver and kernel/DKMS state (A2, L3 change) → correct the GDS configuration (A4) → server firmware update (A10 Dell, A5 DGX only, A11 NVL72 tray; change window) → NIC firmware: burn the image (A12), then activate it without a full reboot (A3) → reboot or host power cycle (A6, A7) → iDRAC reset (A13) → switch upgrade (A8, fabric impact).

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A9 | Fix repo TLS failure `[C:L1]` | Correct time sync (`chronyc tracking`, `chronyc sources` to read); CA/TLS fix is outside the sources | **L2.** Offset confirmed | Package installs only | n/a |
| A2 | Align driver and kernel/DKMS state `[GAP:G15]` | (no command text for driver flavor/swap; `dkms status` / `uname -r` are read-only `[X:13]`). L3 change: set the approved driver version in the GPU Operator configuration of the Rafay blueprint; roll it to the canary group first (rolling upgrade below). On a host with no GPU Operator, install the approved driver package set | **L3.** Evidence captured; node drained; the target driver is in the approved release matrix; change window | Node-level driver change; GPU workloads stop | Reinstall the previous driver package set, or set the previous blueprint version |
| A4 | Enable GDS P2PDMA mode `[GAP:G45]` | (no command text; the P2PDMA setting for NVMe is in `/etc/cufile.json`; the exact key path is not confirmed) | **L2.** `gdscheck -p` shows `NVMe P2PDMA : Unsupported` and platform requirements are met; node drained | Affects GDS I/O paths on the node | Restore the saved `cufile.json` |
| A10 | Update BIOS / iDRAC / component firmware on Dell XE9780/XE9785 `[GAP:G43]` | (no command text; use the iDRAC Lifecycle Controller with the pinned firmware repository from Dell Repository Manager, per the Dell Lifecycle Controller update procedure in [onsite-procedures.md](../handbook/onsite-procedures.md)) | **L3.** Only via the change procedure; versions from the approved release matrix; node drained; ComputeDomain check | Some parts need an **AC power cycle**; node out of service | Apply the previous versions from the pinned repository the same way |
| A5 | Update BMC / BIOS / GPU / NIC firmware via DGX tooling (DGX only) `[C:§10]` | `nvfwupd` (DGX only; not for Dell or NVL72 trays) | **L3.** Only via the change procedure; node drained; ComputeDomain check | Some parts need an **AC power cycle**; node out of service | Re-flash the previous firmware via the same procedure |
| A11 | Update NVL72 compute-tray firmware and the tray BMC `[GAP:G44]` | (no command text; ask the supplier for the procedure and the tool) | **L3.** Supplier procedure in hand; change window; no active IMEX/ComputeDomain job in the rack | Tray out of service; the NVLink domain can lose this tray | Supplier rollback procedure |
| A12 | Burn approved firmware on a ConnectX NIC `[R]` | `flint -d <dev> -i <fw.bin> burn` `[R]` (the image file for this board, from the approved release matrix); then activate with A3 | **L3.** `flint -d <dev> q` `[X:12]` saved (version and PSID); the image matches the PSID; the previous approved image file is kept; node drained; change window | New firmware becomes active only after A3 or a power cycle; RDMA traffic on the NIC stops at activation | Burn the previous approved image with the same command, then A3 |
| A3 | Activate burned firmware without a full reboot `[X:11]` | `mlxfwreset -d <dev> query` then `mlxfwreset -d <dev> -y reset [--level 3\|4]` | **L3.** `query` read; node drained; change window. Known issue: BF3 in DPU mode may need explicit `--level 4` or `--method 1` | Level 3 restarts the driver and resets PCI; level 4 is a warm reboot; some platforms need an AC power cycle | None; burn the previous image (A12) and reset again |
| A6 | Reboot / host power cycle `[C:§10]` | Reboot after drain, or a host power cycle through iDRAC: `racadm serveraction powercycle` `[R]` (power cycles the host; iDRAC stays up) | **L2.** Drained; never on an active IMEX domain without the job owner | Node jobs stop | None |
| A7 | NIC missing after hotplug/DPC event `[C:§10]` | Reboot after drain (A6) | **L2.** `lspci -tv` shows the NIC missing, `dmesg -T` shows DPC | Node jobs stop | None |
| A13 | Reset iDRAC (BMC only) `[R]` | `racadm racreset` `[R]` (from the management host, or with local racadm on the host OS) | **L3.** `racadm getsysinfo` `[R]` fails or iDRAC hangs; console log saved; change window | Resets iDRAC only; the host and its jobs keep running; iDRAC is not reachable for some minutes | None; wait, then read `racadm getsysinfo` `[R]` again |
| A8 | Switch/MLNX-OS upgrade `[GAP:G08]` | (no command text) | **L3.** Change window; UFM backup (RB-04 A1) | Fabric impact | Per vendor rollback |

### Rolling upgrade (driver, firmware, DOCA)

Use this order for each fleet change.
The change follows procedures L4 and L7 of [runbook-catalog.md](../handbook/runbook-catalog.md).

1. Check the target versions against the approved release matrix.
2. Upgrade the canary group first (one canary group for each vendor, [hardware-matrix.md](../handbook/hardware-matrix.md)).
3. Run section 9 on each canary node. Record the result in the change record.
4. Stop at the first regression. Do not upgrade more nodes.
5. Rollback gate: when a node fails section 9, roll it back (A1 for DOCA, A2 for the driver, the previous version for A5, A10, A11, or A12).
6. When the canary group passes, continue in small batches. Drain one batch at a time (RB-08) and repeat step 3 for each batch.

## 8. Evidence to collect

Evidence to capture: `ipmitool sel list`, `ipmitool sensor`, `dmesg -T`, `uname -r`, `dkms status`, `doca-info`, `flint -d <dev> q`, `lspci -vvv`, `nvidia-bug-report.sh`, and on Dell `racadm techsupreport collect` + `export`.
Also capture the DKMS build log (`/var/lib/dkms/<module>/<version>/build/make.log`) for a build failure, `racadm getsel` `[R]` and the console log for a node that does not boot, and `racadm getversion` `[R]` for a firmware question.

## 9. Return to service

Verify the fix:
1. `dmesg -T` shows no oops/DPC after a soak period; `lspci -tv` shows all devices; `lspci -vvv` shows `LnkSta` equal to `LnkCap`.
2. `dkms status` shows modules built for `uname -r`; `doca-info` and `flint -d <dev> q` show the approved versions.
3. `ibstat` `Active`; `ib_write_bw -d <dev> -a` at line rate; `rdma statistic` clean.
4. `dcgmi diag -r 3` on the drained node, then RB-08 return-to-service.

## 10. Escalation

- **Internal:** L1 hands over to L2 at the end of section 3 with no fix, at once for P1 and P2. L2 hands over to L3 when the runbook ends with no fix, or when the fix needs more than a standard change ([shift-discipline.md](../handbook/shift-discipline.md#4-the-escalation)).
- NVIDIA support (networking/DOCA): `rcprdma` oops with `doca-info`, kernel version, `dmesg -T` oops text. Roll back and open the case before trying workarounds.
- NVIDIA support (GPU driver): Xid 119, 120, or 109 with `nvidia-bug-report.sh` and the driver version against the matrix.
- Dell/OEM (RMA case): `racadm techsupreport collect` + `export` bundle, `ipmitool sel list`.
- Site hardware: a NIC or GPU whose `LnkSta` stays below `LnkCap`; NIC permanently missing after reboot.

## 11. Customer message

> **SEV1/SEV2 template — firmware/driver regression:**
> "A <driver/firmware> update on <node(s)> caused a <regression description>. We are rolling the affected node(s) back to the last known-good version under ticket <ticket-id>; your job <job-id> <was stopped for the rollback / may run at reduced performance until <time>>. Jobs restart from their last checkpoint: <verified / not verified yet>. Next update by <time: the update interval of the priority, see shift-discipline.md>."

## Appendix A — Gaps & open questions

- `[GAP:G01]` No package query (`dpkg`/`rpm`/`apt`) in the gist for installed driver/FM packages; `doca-info` covers DOCA/OFED only.
- `[GAP:G08]` No switch (NVOS/MLNX-OS) upgrade-path commands.
- `[GAP:G09]` No read-only firmware-version command for GPU, BMC or BIOS. `nvfwupd` is the updater (state-changing).
  On Dell, `racadm getversion` and `racadm swinventory` `[R]` now read the BIOS, iDRAC, and component versions; the NVL72 tray is still open.
- `[GAP:G15]` No command to identify open vs proprietary kernel module or to swap the driver flavor (DMA-BUF limitation, signature 65).
- `[GAP:G43]` The `racadm update` options for an update from a firmware repository were not confirmed; use the Dell Lifecycle Controller procedure.
- `[GAP:G44]` No firmware and BMC update procedure for an NVL72 compute tray; ask the supplier.
- `[GAP:G45]` The exact `cufile.json` key path for the NVMe P2PDMA mode was not confirmed.
- DOCA downgrade is given as a procedure by link, not as package strings, because package names depend on OS and DOCA version.

## Appendix B — Source trace

| Step / claim | Guide section | Gist / external |
|---|---|---|
| Steps 1-2 | G summary row 5, §5 (`rcprdma`), R4 | L1 `ipmitool` |
| Steps 3-6 | §9 (Dell wiki), catalogue G9 | RACADM CLI guide (Dell); ipmitool SOL |
| Steps 7-8 | G summary row 5, §5 (`rcprdma`), catalogue G4 | L1 `dmesg -T` |
| Steps 9-10 | §4 (CX5 Ex), §6 (CX7 hotplug), R4 | L1 `lspci -tv`, `lspci -vvv` |
| Step 11 | D (`wait_fw_init`, `mlx5_load_one`) | X11, X12 |
| Steps 12-13 | §5 (`uname -r`, `dkms status`) | X12, X13 |
| Step 14 | §5 (SSL handshake) | L1 `chronyc` ("weird TLS/token errors") |
| Steps 15-17 | §5 | L2 `nvidia-smi`; L4 `ibstat`, `rdma statistic`, `ib_write_bw` |
| Step 18 | §5 (`gdscheck`) | X15 |
| Step 19 | catalogue G10 | L7 `kubectl get pods -n gpu-operator` |
| A1, A5, A6 | §5, §1 (state-changing) | X14; §10 `nvfwupd`, reboot |
| A3, A12 | §6 | X11; NVIDIA MFT `flint` |
| A10, A13 | §9 (Dell wiki) | Dell Lifecycle Controller; RACADM CLI guide |
