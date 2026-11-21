---
id: RB-06
title: BlueField / DPU boot, mlx5 firmware-init failures, eSwitch / OVS / HBN datapath
owner_layers: [L1, L4]
severity:
  default: SEV2
  escalate_to: "SEV1 when DPU-hosted network functions are down for production nodes, or a compute tray will not boot"
signatures: [70, 71, 72, 73, 74, 75, 76, 77, 78, 79]
guide_refs: ["§6", "D (BlueField / DPU messages, IB messages `wait_fw_init`, `mlx5_load_one`)"]
gist_refs: ["L1", "L4", "§10", "NVUE `nv` commands"]
related:
  upstream: [RB-04, RB-05]
  downstream: [RB-05, RB-04]
  lookalike: [RB-04, RB-05]
gaps: [G10, G11]
---

# RB-06 — BlueField / DPU boot, mlx5 firmware-init failures, eSwitch / OVS / HBN datapath

Collect the rshim console and UEFI logs **before** re-flashing (guide §6 caveat). Commands use `rshim0`; substitute the `rshim<N>` device that belongs to the DPU you are debugging (check `ls /dev/rshim*`).

## 1. Trigger

| # | Signature (verbatim) | Decoder meaning |
|---|---|---|
| 70 | `Synchronous exception at 0x0000000000000` (GB300 compute tray boot) | Early-boot fault of the **host CPU**, not the DPU (step 4). Usually UEFI/firmware/DPU-BMC credential or secure-boot issue. |
| 71 | `Exiting boot services...` / UEFI `GET P-S:fail(14)` (BlueField-3 boot hang) | UEFI could not get credentials/state from the DPU BMC. Check DPU BMC firmware and lifecycle state. |
| 72 | BF3 firmware update hang: `eMMC probed` then no output; only `UP_TIME` increments | BFB/OS install hang: BFB/firmware/rshim incompatibility or power issue. |
| 73 | `mlx5_core ... wait_fw_init:316: Waiting for FW initialization, timeout abort` | Mellanox/BF firmware failed to finish initializing: corrupt/incompatible firmware, power issue, or bad BFB. |
| 74 | `mlx5_load_one failed with error code -16` | Firmware init failed (`-EBUSY`); common after DPU/ConnectX firmware updates or bad power events. |
| 75 | BF3 mixed port link type (IB + Ethernet) confusion | `LINK_TYPE` per port mismatch. |
| 76 | HBN 3.2.2 L3 EVPN VXLAN: `TX packets massively dropped despite correct control-plane state` | Datapath/offload fault while control plane is correct. |
| 77 | BF3 TLP emulation stays disabled after reset (DOCA 3.5 / FW 32.50.1002) | Config not applied after reset (G10). |
| 78 | Out-of-order DPU packets through default OVS bridge (`OUT_OF_ORDER`) | DPU OVS reordering; may need flow offloads, queue config, or a different OVS/DOCA version. |
| 79 | BF3 DPU mode: `eSwitch never delivers vport traffic to representors` | eSwitch mode or representor mapping problem. |

## 2. Impact and blast radius

- **Severity:** SEV2 by default. SEV1 when DPU-hosted network functions are down on production nodes or a GB300 compute tray will not boot.
- **Priority:** SEV2 is P3 in the P1 to P4 table of [shift-discipline.md](../handbook/shift-discipline.md#1-the-priority): one node or one tray is affected.
  It is P2 when an NVL72 domain or many nodes lose the network.
- **Blast radius:** one node — every DPU-hosted network function on it (its jobs lose the network) — for a DPU boot or datapath fault. One compute tray that will not boot — the tray's GPUs: 8 on an HGX server; 4 on an NVL72 compute tray (18 trays of 4 GPUs), which removes 4 of the rack's 72 domain GPUs. An HBN/eSwitch fault on a DPU affects **the tenant flows on that DPU only**, not the whole fabric.

## 3. First 5 minutes

1. `cat /dev/rshim0/misc` `[X:06]` — expected: `UP_TIME` increasing, boot progressing past UEFI.
2. `dmesg -T | grep -iE 'mlx5_core|rshim|bluefield|fw init'` `[C:L1]` — expected: no `wait_fw_init` timeout, no mlx5_load_one error.
3. `ethtool -S <rep>` `[C:L4]` — expected: no drops on the representor.

Dashboards to open: the UFM Telemetry dashboards for the node's fabric counters, and the Grafana GPU dashboard (dcgm-exporter) to see whether the node's GPUs went idle with the network.

**Who runs it:** L1 runs steps 1, 2, and 3 (read-only; [l1-primer.md](../handbook/l1-primer.md)). Steps that need root on the host or a login to the DPU Arm OS are L2 when L1 has no such access.

## 4. Hardware variants

Row names follow [hardware-matrix.md](../handbook/hardware-matrix.md) where they apply. BlueField is per-server supplier hardware; the fleet columns below state what changes.

| | Hopper HGX (H100/H200) | Blackwell HGX (B200/B300) | NVL72 rack (GB200/GB300) | AMD Instinct |
|---|---|---|---|---|
| DPU / host NIC | per server supplier | per server supplier; B300: 8 ConnectX-8 SuperNICs, one per GPU (host NICs — the ConnectX path is RB-05 when no Arm cores are involved) | compute trays carry the DPU path | no NVIDIA DPU tooling applies; ask supplier |
| Boot-fault owner | — | — | a GB300 compute-tray boot fault (signature 70) is the **host CPU**, not the DPU: collect the host console/SOL via the BMC and the SEL; rshim does not cover it | — |
| Scale-up services | Fabric Manager | Fabric Manager + NVLSM | Fabric Manager, NVLSM, IMEX across trays | none found; ask supplier |

Same `wait_fw_init` / `-16` signature on a plain ConnectX (no Arm cores, no rshim) is RB-05 territory, not a DPU fault.

## 5. Decision table

**Where to run:**
On the host: the rshim device, mlxconfig, flint, mlxfwreset, bfb-install, lspci, ipmitool, and the host NIC view of ibstat and ethtool.
On the DPU Arm OS: the OVS commands, devlink eswitch, the representors (ethtool on a representor), and nv show in the HBN container.
To reach the DPU Arm OS, use the rshim console, the `tmfifo_net0` interface from the host, or ssh to the DPU out-of-band (OOB) port.

| # | Layer | Command | Good looks like | Bad looks like | Next |
|---|---|---|---|---|---|
| 1 | L1 | `ipmitool sel list` and `ipmitool sensor` `[C:L1]` | No PSU/thermal events at the failure time | Power events | Power issue: site hardware; also RB-05 |
| 2 | L1 | `dmesg -T \| grep -iE 'mlx5_core\|rshim\|bluefield\|fw init'` `[C:L1]` | Clean | wait_fw_init timeout, mlx5_load_one error -16 | Step 3 |
| 3 | L1 | `cat /dev/rshim0/misc` `[X:06]`; for logs `echo "DISPLAY_LEVEL 2" > /dev/rshim0/misc` then `cat /dev/rshim0/misc` `[X:06]` | `UP_TIME` increasing, boot progresses past UEFI | `UP_TIME` increments but no output after `eMMC probed`; `SW_RESET` loops | Save the output; step 5. A compute tray whose host does not boot: step 4 |
| 4 | L1 | Host CPU boot fault on a GB300 compute tray (signature 70): the BMC SOL console, `ipmitool sol activate` `[R]`, and `ipmitool sel list` `[C:L1]` | Boot messages reach the host OS | `Synchronous exception` in the host console | Save the console log and the SEL. Do not use rshim or Mitigation A1: this is the host CPU. Escalate (section 10). Host power cycle (Repair A9) only after the evidence is saved |
| 5 | L1 | `minicom -D /dev/rshim0/console -C console_logs.txt` `[X:07]` | Boot messages reach the OS | Stuck at `Exiting boot services...`, `GET P-S:fail(14)`, or no output after `eMMC probed` | Collect logs, then Mitigation A1 (reset) only if logs saved. Still hangs: Repair A2 (BFB reinstall) |
| 6 | L1 | `lspci -tv` `[C:L1]` | BlueField/ConnectX PFs present | Missing device | RB-05 (hotplug/DPC) |
| 7 | L1 | `flint -d <dev> q` and `/opt/mellanox/doca/tools/doca-info` `[X:12]` | Firmware and DOCA match the approved matrix | Mismatch or unknown firmware | NIC firmware: RB-05 Repair A12 (burn), then Repair A5 here (activate). DOCA: RB-05 Mitigation A1. The full DPU bundle: Repair A2 |
| 8 | L1 | `mlxconfig -d /dev/mst/<dev> q` `[X:09]` (run `mst start` first) | Values equal the intended configuration (link type, mode, port split, TLP emulation) | A value not applied after reset (signature 77); wrong mode or split | TLP emulation: Repair A8. Link type or mode: Repair A3. Port split: Repair A4 |
| 9 | L4 | `ibstat` and `ethtool <nic>` `[C:L4]` | Expected link layer (IB or ETH) per port | Port in the wrong link layer (signature 75) | Repair A3 |
| 10 | L4 | `ethtool -S <rep>` `[C:L4]` | No drops on the representor | Drops/discards (signature 76, 79) | Step 11 |
| 11 | L4 | `nv show interface`, `nv show interface <swp> counters`, `nv show router bgp`, `nv show vrf` `[C:L4]` (run in the HBN container where `nv` is available; `[GAP:G11]`) | Control plane up, counters flowing | Control plane correct but TX drops | Step 12 |
| 12 | L4 | `ovs-vsctl show`, `ovs-ofctl dump-flows <bridge>`, `ovs-appctl dpctl/dump-flows -m`, `ovs-appctl dpctl/dump-conntrack -m`, `ovs-appctl dpif-netdev/pmd-stats-show` `[X:16]` | Flows offloaded (`offloaded:yes` / `dp:doca` indications) | Flows not offloaded; out-of-order | Mitigation A6/Repair A7; or DOCA/OVS version issue (RB-05) |
| 13 | L4 | `devlink dev eswitch show pci/<bdf>` `[X:18]` | Mode `switchdev` for DPU mode | `legacy` or unexpected | Repair A7 |

**Who runs it:** L1 may run steps 1, 2, 6, and 9 (read-only). All other steps are L2 or L3.

### Read-only diagnostics (by layer)

| Layer | Command | Tag | Look for |
|---|---|---|---|
| L1 | `ipmitool sensor`, `ipmitool sel list`, `dmesg -T`, `lspci -tv` | `[C:L1]` | Power/PCIe/driver messages |
| L1 | `ipmitool sol activate` | `[R]` | Host console of a compute tray (signature 70) |
| L1 | `cat /dev/rshim0/misc`, `echo "DISPLAY_LEVEL 2" > /dev/rshim0/misc` | `[X:06]` | Boot state, `UP_TIME`, `SW_RESET`, rshim log |
| L1 | `minicom -D /dev/rshim0/console -C console_logs.txt` | `[X:07]` | Console log for support |
| L1 | `flint -d <dev> q`, `doca-info`, `mlxfwreset -d <dev> query`, `mlxconfig -d /dev/mst/<dev> q` | `[X:12]`, `[X:11]`, `[X:09]` | Firmware and config (run `mst start` first for `mlxconfig`) |
| L4 | `ibstat`, `ethtool <nic>`, `ethtool -S <nic>`, `ethtool -S <rep>` | `[C:L4]` | Link layer, drops |
| L4 | `nv show interface` and related `nv show` | `[C:L4]` | Port and routing state |
| L4 | `ovs-vsctl show`, `ovs-vsctl list open_vswitch`, `ovs-vsctl list interface`, `ovs-ofctl dump-flows <bridge>`, `ovs-appctl dpctl/dump-flows -m`, `ovs-appctl dpctl/dump-conntrack -m`, `ovs-appctl dpif-netdev/pmd-stats-show`, `systemctl status openvswitch` (RPM) / `openvswitch-switch` (Debian) | `[X:16]` | OVS state and offload |
| L4 | `devlink dev eswitch show pci/<bdf>` | `[X:18]` | eSwitch mode |

### Differential diagnosis

| Looks like | How to tell | Go to |
|---|---|---|
| Host NIC/fabric fault | Host `ethtool -S`/`perfquery -x` show errors, representors are fine | RB-04 |
| Same `wait_fw_init`/`-16` on a ConnectX without a DPU | Device has no Arm cores / no rshim | RB-05 |
| Driver/DOCA regression | Started after a DOCA/OFED change | RB-05 |
| Host PCIe/hotplug (DPC) | NIC missing from `lspci -tv` | RB-05 |
| Power event | `ipmitool sel list` shows PSU events at the time of failure | RB-05, RB-08 |

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

The retry/restart rung — the fastest actions that restore a hung DPU boot or a stuck datapath; the Repair section holds the firmware and configuration corrections.

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A1 | Restart DPU boot cycle (Arm software reset) `[X:08]` | `echo "SW_RESET 1" > /dev/rshim0/misc` | **L2.** Only for signatures 71 and 72 (`Exiting boot services...`, `GET P-S:fail(14)`, the eMMC hang); never for signature 70 (host CPU). `cat /dev/rshim0/misc` and console log saved; node drained | Safe in isolation; **drops DPU-hosted network functions** | None; boot again, verify with `cat /dev/rshim0/misc` |
| A6 | Restart OVS / reset PMD counters / tune aging `[X:17]` | `systemctl restart openvswitch` (RPM) or `openvswitch-switch` (Debian); `ovs-appctl dpif-netdev/pmd-stats-clear`; `ovs-vsctl set Open_vSwitch . other_config:max-idle=<ms>` | **L2.** Node drained, or the tenants on this DPU notified and the job owner agrees; flow/conntrack dumps saved; maintenance window | Drops DPU datapath flows during restart; tenant traffic on this DPU stops | Restart again; set the previous `max-idle` |

## 7. Repair

Remediation ladder: reinstall the BFB / firmware (A2, change window) → correct the port/DPU configuration (A3, A4, A8) → load firmware without reboot (A5) → change eSwitch mode (A7) → reboot or BMC power cycle (A9).

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A2 | Reinstall BFB / DPU firmware `[X:29]` | `bfb-install --bfb <file.bfb> [--config bf.cfg] --rshim rshim0`; deferred firmware bundle: `bfb-install --deferred -r rshim0 -b <fw-bundle>.bfb` | **L3.** Node drained; logs saved first. Save the DPU configuration: the OVS bridges (`ovs-vsctl show` `[X:16]`), the HBN/NVUE configuration (`nv config show -o commands` `[R]` in the HBN container), `bf.cfg`, and `mlxconfig -d /dev/mst/<dev> q` `[X:09]`. BFB matches the DPU OPN; change window. **Must not be interrupted or followed by a restart before it finishes** | DPU is re-imaged: the OVS database, the HBN/NVUE configuration, and the `bf.cfg` settings are lost. Redeploy them after the install | Reinstall the previous BFB, then redeploy the saved configuration |
| A3 | Change port link type or DPU mode `[X:09]` | `mst start`; `mlxconfig -d /dev/mst/<dev> q` (save), then `mlxconfig -d /dev/mst/<dev> set LINK_TYPE_P1=<1 IB / 2 ETH>`, or for the BlueField-3 mode `mlxconfig -d /dev/mst/<dev> s INTERNAL_CPU_OFFLOAD_ENGINE=<0\|1>` `[R]` (0 = ENABLED = DPU mode; 1 = DISABLED = NIC mode). Keep `INTERNAL_CPU_MODEL` at `EMBEDDED_CPU` (the default) | **L3.** Saved `q` output; node drained; change window | Takes effect at next boot/power cycle ("Please reboot machine to load new configurations"); a change to NIC mode needs a power cycle | `mlxconfig set` the saved values; reboot |
| A4 | Change port split `[X:10]` | `mlxconfig -d /dev/mst/<dev> set MODULE_SPLIT_M0[...]=... NUM_OF_PF=<n>` | **L3.** `show_system_conf` read; saved `q`; node drained | Port layout changes after reboot | Restore saved values; reboot |
| A5 | Load firmware without reboot `[X:11]` | `mlxfwreset -d <dev> query`, then `mlxfwreset -d <dev> -y reset [--level 3\|4]` (BF3 in DPU mode may need `--level 4` or `--method 1`) | **L3.** `query` read; drained | Driver restart/PCI reset (3) or warm reboot (4) | None |
| A7 | Change eSwitch mode `[X:18]` | `devlink dev eswitch set pci/<bdf> mode switchdev` (or `legacy`) | **L3.** Node drained; the tenants on this DPU notified; **all VFs unbound first**; saved `devlink dev eswitch show` | Representors created/removed; traffic interruption | Set the previous mode |
| A8 | TLP emulation toggle `[GAP:G10]` | (no command text) | **L3.** `mlxconfig ... q` saved; node drained | Needs reboot/power cycle | Restore saved value |
| A9 | Reboot / BMC power cycle `[C:§10]` | Reboot after drain, or a host power cycle: on Dell `racadm serveraction powercycle` `[R]`; on an NVL72 compute tray through the tray BMC (ask the supplier) | **L2.** Drained; never on an active IMEX domain without the job owner | Node jobs stop | None |

## 8. Evidence to collect

Evidence to capture before re-flashing: rshim log (`DISPLAY_LEVEL 2` + `cat /dev/rshim0/misc`), console log (`minicom ... -C console_logs.txt`), `dmesg -T`, `ipmitool sel list`, `flint -d <dev> q`, `doca-info`, `mlxconfig -d /dev/mst/<dev> q`.
For signature 70, capture the host console from the BMC SOL and the SEL instead of the rshim log.
Before Repair A2, also save the OVS, HBN/NVUE, and `bf.cfg` configuration of the DPU.

## 9. Return to service

Verify the fix:
1. `cat /dev/rshim0/misc` shows boot completed with `UP_TIME` increasing; the OS console is reachable.
2. `dmesg -T` shows no `wait_fw_init` timeout or mlx5_load_one error.
3. `ibstat`/`ethtool <nic>` show the intended link layer; `ethtool -S <rep>` drops flat.
4. OVS flows are offloaded (`ovs-appctl dpctl/dump-flows -m`) and `devlink dev eswitch show pci/<bdf>` shows the intended mode.

## 10. Escalation

- **Internal:** L1 hands over to L2 at the end of section 3 with no fix, at once for P1 and P2. L2 hands over to L3 when the runbook ends with no fix, or when the fix needs more than a standard change ([shift-discipline.md](../handbook/shift-discipline.md#4-the-escalation)).
- NVIDIA support (BlueField): rshim console + UEFI logs, firmware/BFB/DOCA versions, `mlxconfig q`, power events from the BMC SEL. BF3 boot hangs are frequently firmware/BMC-credential or rshim related.
- Host CPU boot fault on a compute tray (signature 70): the supplier and NVIDIA, with the BMC SOL console log and the SEL.
- Site hardware: repeated power events on the tray.
- Attach `nvidia-bug-report.sh` where a host GPU is involved, and, if the DPU OS is reachable, its installation log (`/root/.installation.log`, per the BlueField troubleshooting guide).

## 11. Customer message

> **SEV1/SEV2 template — DPU / compute-tray boot fault:**
> "Node <node-id> lost its network path (or failed to boot) due to a <DPU firmware / compute-tray boot> fault. The node's job(s) <job-id(s)> were stopped and will restart from their last checkpoint under ticket <ticket-id>. Other nodes are unaffected: <verified / not verified yet>. Estimated return of the node: <time>. Next update by <time: the update interval of the priority, see shift-discipline.md>."

## Appendix A — Gaps & open questions

- `[GAP:G10]` The `mlxconfig` parameter that controls BF3 TLP emulation (DOCA 3.5 / FW 32.50.1002) was not found in public docs.
- `[GAP:G11]` No documented command to open the HBN container shell where `nv show` runs on the DPU.
- Public docs list `echo 'SW_RESET 1' > /dev/rshim0/misc` as a soft reset; there is no documented undo beyond waiting for boot.

## Appendix B — Source trace

| Step / claim | Guide section | Gist / external |
|---|---|---|
| Steps 1-2 | §6 diagnostics 2, D (`wait_fw_init`) | L1 `ipmitool`, `dmesg -T` |
| Steps 3-5 | §6 diagnostics 1, D (BlueField messages) | X06, X07; ipmitool SOL |
| Steps 6-8 | §6, R4 | L1 `lspci -tv`; X09, X12 |
| Steps 9-11 | §6 diagnostics 3 | L4 `ibstat`, `ethtool`, `nv show` |
| Steps 12-13 | §6 (OVS, eSwitch) | X16, X18 |
| A1-A9 | §6 state-changing | X08, X29, X09, X10, X11, X17, X18; §10 reboot; BlueField modes of operation (`INTERNAL_CPU_OFFLOAD_ENGINE`) |
