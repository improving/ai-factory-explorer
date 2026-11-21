---
id: RB-04
title: InfiniBand / RoCE link down, slow or flaky; switch, UFM and Cumulus issues
owner_layers: [L4, L1]
severity:
  default: SEV2
  escalate_to: "SEV1 when a fabric-wide fault, subnet manager loss, or multiple rails affect production jobs"
signatures: [46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60]
guide_refs: ["§5", "§7", "§1 (CX8 SuperNIC)", "D (InfiniBand / RoCE / network messages)", "P (Job is slow)"]
gist_refs: ["L4 (incl. UFM and NVUE tables)", "§9", "§10", "§11.4"]
related:
  upstream: [RB-02, RB-07]
  downstream: [RB-06, RB-05, RB-07]
  lookalike: [RB-06, RB-02]
gaps: [G05, G06, G07, G08, G13, G14, G40]
---

# RB-04 — InfiniBand / RoCE link down, slow or flaky; switch, UFM and Cumulus issues

Repeat the per-port commands for every HCA/port on the node. This runbook owns the **raw-fabric isolation procedure** (`ib_write_bw`, `perfquery`, `iblinkinfo`). RB-02 and RB-07 link here.

## 1. Trigger

| # | Signature (verbatim) | Decoder meaning |
|---|---|---|
| 46 | `Port ... Active/ LinkUp` expected, but `ibstat` shows `Polling`, `Disabled` or `LinkDown` | Healthy IB state is `Active`/`LinkUp`; otherwise check cable/transceiver/FEC. |
| 47 | Link below rate, flapping, high BER (`iblinkinfo`, `perfquery -x`, `mlxlink`) | Physical-layer or cable/transceiver fault. |
| 48 | PFC / ECN / CNP counters growing (`ethtool -S`) | RoCE congestion: PFC storm or ECN marking means lossless-fabric misconfiguration or incast. |
| 49 | `Duplicated LID forCA GUID` | Two ports got the same LID. Fabric misconfiguration; review `prism_an_lmc`, `lmc`, `lids_per_rtr`. |
| 50 | `hm_ports_health_policy_file` option does not work | Q3400-RA on NVOS is not MLNX-OS; classic SM options may be unsupported. |
| 51 | `iblinkinfo -S GUID` does not work | Same: NVOS differs from MLNX-OS. UFM or a dedicated OpenSM server is needed for IB SM functions. |
| 52 | `gNMI per-channel PHY telemetry mismatch` vs PPCNT | Telemetry sources disagree; compare with `perfquery -x`. |
| 53 | `mlxlink` PRBS test does not work | PRBS flags/mode issue on Q3400-RA. |
| 54 | CX8 C8180: port split to Config-7 creates Ethernet port instead of IB | Port split/link-type configuration mismatch. |
| 55 | QM9700 ↔ SB7800 connectivity (NDR vs EDR signaling) | *Outside this fleet (EDR SB7800).* Speed/signaling mismatch between switch generations. |
| 56 | UFM event / subnet-manager failover / `ufm_telemetry` counters missing from dashboards | UFM HA state or telemetry service problem. |
| 57 | "Port is up but unreachable" | Connectivity fails while `ibstat` looks clean. |
| 58 | `Network performance causing GPU idle time` | Fabric slowness shows up as GPU idle time. |
| 59 | Switchless ring host chaining with `MCX755106AC-HEAT` | *Outside this fleet (switchless ring; the fleet uses a switched fabric).* Host-to-host chaining topology question. |
| 60 | ConnectX-8 SuperNIC mode questions (IB vs Ethernet) | Link-layer mode confusion. |
| — | A NIC port at a lower speed, or one rail disabled | Negotiation, FEC, or cable fault, or a port that is administratively down on the node, the switch, or in UFM (steps 4, 14, 15). |
| — | Switch failure, or a planned switch upgrade | Catalogue N9: list the affected nodes, drain them, and change one leaf first (step 17). |

## 2. Impact and blast radius

- **Severity:** SEV2 by default. SEV1 for subnet-manager loss or a fabric-wide fault. SEV3 for one flapping port with redundancy.
- **Priority:** SEV2 is P2 in the P1 to P4 table of [shift-discipline.md](../handbook/shift-discipline.md#1-the-priority): a fault on a rail or a leaf affects many nodes.
  One flapping port with redundancy (SEV3) is P3.
- **Blast radius:** one link or port — degraded bandwidth for the jobs on that node/rail. One leaf or rail — the job class scheduled on that rail. Subnet-manager/UFM loss or a fabric-wide congestion fault — **the fabric**: every production multi-node job. A storage-leaf RoCE storm additionally affects **all storage clients** (RB-07).

## 3. First 5 minutes

1. `ibstat` `[C:L4]` — expected: `Active`, `LinkUp`, expected rate and link layer.
2. `iblinkinfo` `[C:L4]` — expected: every link at the expected speed/width.
3. `perfquery -x <lid>` `[C:§11.4]` — expected: `SymbolErrorCounter`, `LinkErrorRecoveryCounter`, `LinkDownedCounter` flat.

Dashboards to open: the UFM Telemetry dashboards (fabric counters, link events, HA state) and the Grafana GPU dashboard (dcgm-exporter) to see the GPU idle time caused by the fabric (signature 58).

**Who runs it:** L1 runs steps 1, 2, and 3 (read-only; [l1-primer.md](../handbook/l1-primer.md)). When a step needs root on the node and L1 has no root access, L2 runs it.

## 4. Hardware variants

Row names follow [hardware-matrix.md](../handbook/hardware-matrix.md), Table 1. For a fabric runbook the switch-generation differences are the operative variants (guide §7).

| | Hopper HGX (H100/H200) | Blackwell HGX (B200/B300) | NVL72 rack (GB200/GB300) | AMD Instinct |
|---|---|---|---|---|
| Scale-out NIC | ask supplier | B300: 8 ConnectX-8 SuperNICs, one for each GPU, up to 800 Gb/s each; B200: ask supplier | ask supplier | ask supplier |
| Expected port rate | ConnectX-7 on NDR: `ibstat` `Rate: 400` | ConnectX-8 on XDR (Quantum-X800): `Rate: 800`; ConnectX-7 on NDR: `Rate: 400` | same as Blackwell HGX, per the NIC of the tray | ask supplier |
| Expected RoCE speed (Spectrum-X) | `ethtool <nic>` speed equals the NIC and the leaf port (400G) | 400G (ConnectX-7) or 800G (ConnectX-8), equal to the leaf port | same | ask supplier |
| Prometheus exporter | `dcgm-exporter` | same | same | AMD Device Metrics Exporter (GPU and NIC) |
| Failure domain of one scale-up fault | 1 server, 8 GPUs | 1 server, 8 GPUs | up to 1 rack, 72 GPUs | 1 server, 8 GPUs |

Switch-generation differences that change the commands and signals:

| Variant | On MLNX-OS (QM9700 etc.) | On NVOS (Q3400-RA) |
|---|---|---|
| Port rate | QM9700 (Quantum-2): NDR, 400G | Q3400 (Quantum-X800): XDR, 800G |
| Subnet manager functions | Classic SM commands work | Many are unsupported or behave differently (`iblinkinfo -S`, `hm_ports_health_policy_file`); UFM or a dedicated OpenSM server is required |
| Telemetry | PPCNT via `perfquery -x` | gNMI per-channel PHY telemetry may disagree with PPCNT (signature 52) |
| PRBS testing | `mlxlink` PRBS works | `mlxlink` PRBS test does not work (signature 53) |
| Inter-generation links | — | QM9700 ↔ SB7800 NDR-vs-EDR signaling mismatch (signature 55; outside this fleet) |

## 5. Decision table

| # | Layer | Command | Good looks like | Bad looks like | Next |
|---|---|---|---|---|---|
| 1 | L1 | `ipmitool sel list` `[C:L1]` and `dmesg -T \| grep -iE 'mlx5\|pcie\|aer\|dpc'` `[C:L1]` | No PCIe/AER/power events on the NIC | PCIe errors or NIC reset | NIC/PCIe fault: RB-05 |
| 2 | L1 | `lspci -tv` `[C:L1]` | NIC present on the expected PCIe branch | NIC missing | RB-05 |
| 3 | L4 | `ibstat` `[C:L4]` | Port `Active`, `LinkUp`, expected rate, correct link layer | `Polling`, `Disabled`, `LinkDown`; wrong link layer | Step 4; wrong link layer: mode check (Repair A5) |
| 4 | L4 | `iblinkinfo` `[C:L4]` | Every link at the expected speed/width (section 4: XDR 800G, NDR 400G) | Link below rate or down | Step 5; a port or a rail at a lower speed or disabled: step 15 |
| 5 | L4 | `perfquery -x <lid>` `[C:§11.4]` | `SymbolErrorCounter`, `LinkErrorRecoveryCounter`, `LinkDownedCounter` flat | Growing counters | Step 6. To baseline a soak test after the evidence is saved: Repair A6 |
| 6 | L4 | `mlxlink -d <dev> -p <port>` and `mlxlink -d <dev> -p <port> --cable` `[C:L4]`/`[X:20]` | BER low, optical power/temp in range, FEC as expected | High BER, low optical power, over-temp transceiver | Drain the node (Mitigation A9), then the onsite dispatch (scenario below). PRBS test of the repaired link on request: Repair A7 |
| 7 | L4 | `sminfo` `[C:§11.4]` | A subnet manager is alive | No SM response | `ufm_ha_cluster status` (step 8) |
| 8 | L4 | `ufm_ha_cluster status` `[C:L4]` and `systemctl status ufm_telemetry` `[C:L4]` | One active unit, healthy pair, telemetry active | No active unit; split pair; telemetry down | UFM events (step 16); controlled failover/restart: Mitigation A2 |
| 9 | L4 | `ibnetdiscover` `[C:L4]` and `ibdiagnet` `[C:L4]` (`ibdiagnet`: L2 or higher, off-peak or on request; keep the output as evidence) | Topology matches the cabling plan; no errors in the report | Wrong port map; errors listed; `Duplicated LID forCA GUID` | Duplicated LID: SM configuration change (Repair A4/`[GAP:G06]`) |
| 10 | L4 | `ib_write_bw -d <dev> -a` (server) and `ib_write_bw -d <dev> <host> -a` (client) `[C:§11.4]`; add `--use_cuda=<id>` for the GPU path (needs a perftest built with CUDA). Only on a drained or idle node, or on a spare rail | Bandwidth near line rate | Low bandwidth | Step 11 |
| 11 | L4 | `ib_write_lat -d <dev>` `[C:§11.4]` and `rdma statistic` while the test runs `[C:§11.4]`. Only on a drained or idle node, or on a spare rail | Flat counters, tight latency | Growing `rnr_nak_retry_err`, `packet_seq_err`, `local_ack_timeout_err` (loss/retry); tail latency | RoCE: step 12. IB: back to step 6 |
| 12 | L4 | RoCE only: `ethtool -S <nic>` `[C:L4]` and `nv show interface <swp> counters qos` `[C:L4]` | PFC/ECN/drops flat | PFC pauses, ECN marks, drops growing | Congestion config: `nv show qos roce` / `nv show qos roce status` `[C:L4]`; fix via Repair A3 |
| 13 | L4 | `ibping -S` (remote) + `ibping <lid>` (local) `[C:§11.4]`; `rping -s -a <srv_ip> -V -C 10` + `rping -c -a <srv_ip> -S <cli_ip> -V -C 10` `[C:§11.4]`. Only on a drained or idle node, or on a spare rail | Reachable | Port up but unreachable | Check `show_gids` `[C:§11.4]`; SM or LID issue (steps 7-9) |
| 14 | L4 | RoCE: `ethtool <nic>` `[C:L4]` and `ethtool --show-fec <nic>` `[R]` | Speed equals the NIC and the leaf port (section 4); `Link detected: yes`; FEC equal to the leaf port | Lower speed; link not detected; FEC differs from the leaf port | Step 15 (the switch side) |
| 15 | L4 | Switch side. RoCE: `nv show interface <swp> link` `[C:L4]` (admin state, oper state, speed, FEC). IB: the port state in UFM, or UFM REST via `curl -H "Authorization: Basic ..." https://<ufm>/ufmRest/...` `[C:L4]` | Admin up and oper up; speed and FEC as designed and equal to the node side | Admin down (a disabled port or rail); oper down with admin up; speed or FEC mismatch | Admin down: find the cause (step 16), then Repair A10. Oper down: steps 5 and 6. Speed or FEC mismatch on a leaf: Repair A3 |
| 16 | L4 | UFM events and alarms: the UFM events view, or UFM REST via `curl -H "Authorization: Basic ..." https://<ufm>/ufmRest/...` `[C:L4]`; the subnet manager log (`[GAP:G06]`) | No link, SM, or port-state events near the fault | Link down/up events (flap); SM failover; a port disabled by a user or by UFM | Flap: steps 5 and 6. SM failover: step 8. Port disabled with no change record: Repair A10 after the cause is fixed |
| 17 | L4 | Switch down or planned (catalogue N9): `ibnetdiscover` `[C:L4]` against the port map; the UFM topology; RoCE peers: `nv show interface` `[C:L4]` | A complete list of the nodes and rails on the switch; each node has a path on another rail or switch | Some nodes have their only path on this switch; nodes missing from the port map | Drain the listed nodes (Mitigation A9, RB-08). Canary order: one leaf first, then section 9, then the next leaf. Upgrade: Repair A8 |

**Who runs it:** L1 may run steps 1, 2, 3, 4, 5, and 14 (read-only). All other steps are L2 or L3.

### Scenario: onsite dispatch for a link with symbol errors

Use this scenario when step 5 or step 6 shows a physical-layer fault that needs work at the rack.
The work follows procedures L11 (optic and cable work) and L14 (as-built update) in [onsite-procedures.md](../handbook/onsite-procedures.md).

1. Drain the node before the dispatch (Mitigation A9). For a cable on a switch-to-switch link, list and drain the affected nodes first (step 17).
2. Open the dispatch in the ticket with these fields: the node; both port ends from the port map (node HCA and port, switch and port); the evidence; the drain state; the priority.
3. Attach the evidence: `perfquery -x <lid>` `[C:§11.4]` and `mlxlink -d <dev> -p <port> --cable` `[C:L4]` output.
4. The onsite engineer confirms the drain, then cleans, inspects, or replaces the optic or the cable (procedure L11).
5. After the swap, run section 9 steps 1, 2, and 5: `mlxlink -d <dev> -p <port>` `[C:L4]`, `perfquery -x <lid>` `[C:§11.4]`, and `ibnetdiscover` `[C:L4]` against the port map.
6. The onsite engineer updates the port map and the CMDB (procedure L14) and closes the dispatch with the result.

### Read-only diagnostics (by layer)

| Layer | Command | Tag | Look for |
|---|---|---|---|
| L1 | `ipmitool sel list`, `lspci -tv`, `dmesg -T` | `[C:L1]` | PCIe/power events on the NIC |
| L4 | `ibstat`, `ibstatus` | `[C:L4]`, `[C:§11.4]` | State, rate, LID, link layer |
| L4 | `iblinkinfo`, `ibnetdiscover` | `[C:L4]` | Link speed/width, topology |
| L4 | `perfquery -x <lid>` | `[C:L4]` | Symbol errors, link downed, recovery |
| L4 | `mlxlink -d <dev> -p <port>`, `--cable`, `--ber_collect <file.csv>` | `[C:L4]`, `[X:20]` | BER, optical power, FEC |
| L4 | `ibdiagnet` | `[C:L4]` | Fabric-wide error report |
| L4 | `sminfo`, `ibping`, `rping`, `show_gids` | `[C:§11.4]` | SM alive, connectivity, RoCE GID |
| L4 | `ib_write_bw`, `ib_write_lat`, `rdma statistic` | `[C:L4]`, `[C:§11.4]` | Raw RDMA bandwidth/latency/retry counters |
| L4 | `ethtool <nic>`, `ethtool -S <nic>` | `[C:L4]` | Speed negotiation, PFC/ECN/drops |
| L4 | `ethtool --show-fec <nic>` | `[R]` | FEC mode of the NIC port |
| L4 | `lsmod \| grep -E 'nvidia_peermem\|ib_core'` | `[C:L4]` | GPUDirect RDMA module present |
| L4 | `ufm_ha_cluster status`, `systemctl status ufm_telemetry` | `[C:L4]` | UFM HA pair and telemetry |
| L4 | `nv show interface`, `nv show interface <swp> link`, `nv show interface <swp> counters`, `nv show interface <swp> counters qos`, `nv show qos roce`, `nv show qos roce status`, `nv show system`, `nv show platform`, `nv show service`, `nv show router bgp`, `nv show vrf` | `[C:L4]` | Switch-side state (Cumulus) |
| L4 | `nv config diff -o commands` | `[C:L4]` | Pending vs running config before any apply |
| L4 | `nv config show -o commands`, `nv config history` | `[R]` | Applied config as commands; the revisions for a rollback |
| L4 | `/opt/ufm/scripts/collect_logs.sh` (check the path on your release) | `[C:L4]` | Evidence bundle for NVIDIA support |
| L4 | UFM REST via `curl -H "Authorization: Basic ..." https://<ufm>/ufmRest/...` | `[C:L4]` | Links, ports, alarms, PKeys |
| L8 | `curl -s localhost:9400/metrics \| grep DCGM_FI` | `[C:L8]` | GPU activity during the slowdown (DCGM profiling metric names; `[GAP:G14]`) |

### Differential diagnosis

| Looks like | How to tell | Go to |
|---|---|---|
| NCCL transport or interface problem | `ib_write_bw` is at line rate but NCCL is slow or hangs | RB-02 |
| DPU/representor datapath fault | Fault only on `ethtool -S <rep>`; host NIC counters fine | RB-06 |
| NIC firmware/driver regression | Started right after a DOCA/OFED or firmware change | RB-05 |
| Storage-side slowness | Compute fabric clean; `nv show qos roce` or storage leaf counters show PFC/ECN | RB-07 |
| Q3400-RA NVOS vs MLNX-OS tool differences (`iblinkinfo -S`, `hm_ports_health_policy_file`) | The tool or option is unsupported on NVOS, not a fabric fault | Use UFM or a dedicated OpenSM server for SM functions; `[GAP:G06]` |
| NVLink fabric (in-node) | `nvidia-smi nvlink -s` shows the errors, not `iblinkinfo` | RB-01 |

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

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A2 | Controlled UFM stop/start or failover `[C:§10]` / `[C:L4]` | `ufm_ha_cluster failover` / `takeover` / `stop`; `ufm_ha_cluster start` `[C:prose-state]` | **L3.** Blast-radius check, not a node drain: the affected jobs and leaves listed (the whole fabric for an SM move), the job owners notified. The standby is healthy and synced (`ufm_ha_cluster status` `[C:L4]`). Repair A1 done; change window | Changes which unit manages the fabric; can drop RoCE/IB sessions | `ufm_ha_cluster start` `[C:prose-state]` after a `stop`, or `ufm_ha_cluster takeover` back to the original unit; `ufm_versions_mgr restore` (use `--dry-run` first; stops UFM; change window) for config loss |
| A9 | Drain the affected node (RB-08 shared procedure) `[C:§10]` | `kubectl drain --ignore-daemonsets` or `scontrol update ... State=DRAIN Reason="<ticket>"` | **L2.** ComputeDomain check on NVL72 | Evicts jobs | Uncordon/RESUME after RB-08 return tests |

## 7. Repair

Remediation ladder: back up UFM (A1) → apply the configuration fix (A3, A4, A5) → bring a disabled port or rail back up (A10) → firmware upgrade (A8, change window) → PRBS test on the repaired link (A7) → counter clear to baseline the verification (A6).

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A1 | Back up UFM before any UFM change `[C:§10]` | `ufm_versions_mgr backup` | **L3.** Run on the active unit; in HA copy the backup after failover | No downtime | n/a |
| A3 | Apply a RoCE/QoS or port config on a Cumulus leaf `[C:§10]` | Save `nv config show -o commands` `[R]` to the ticket first. Then `nv set ...`, `nv config diff -o commands`, `nv config apply --confirm <time>` `[R]`, the checks of section 9, and the confirm within the timer: `nv config apply --confirm-yes` `[R]` (`nv config apply --confirm-status` `[R]` shows the time left); then `nv config save` | **L3.** Blast-radius check: the affected nodes and jobs listed, the job owners notified; one leaf first. `nv config show -o commands` saved; `nv config diff -o commands` reviewed and agreed; change window | Storage/frontend fabric changes can drop RoCE sessions | No confirm: the switch rolls back when the timer ends. After the confirm: `nv config history` `[R]`, then `nv config apply <revision>` `[R]` with the previous revision. Before the apply only: `nv config detach` abandons the pending change |
| A4 | Fix duplicate LID / SM option on OpenSM `[GAP:G06]` | (no command text) | **L3.** `Duplicated LID` confirmed with `ibnetdiscover` + `ibdiagnet` | Can briefly re-route the fabric; change window | Restore previous SM config from backup |
| A5 | Change port link type or split (CX8, BF3) `[X:09]`/`[X:10]` | `mlxconfig -d <device> set LINK_TYPE_P1=<1 IB / 2 ETH>` or `mlxconfig -d <device> set MODULE_SPLIT_M0[...]=... NUM_OF_PF=<n>` (`mlxconfig -d <device> show_system_conf` lists configs); `mst start` first | **L3.** `mlxconfig -d /dev/mst/<dev> q` saved; node drained | Takes effect at next boot/power cycle; node out of service | `mlxconfig -d <device> set` the saved values; reboot |
| A10 | Bring a disabled port or rail back up `[R]` | IB switch port: `ibportstate <lid> <port> enable` `[R]`; when UFM manages the fabric or disabled the port, enable it in UFM (`[GAP:G40]`). RoCE leaf: `nv set interface <swp> link state up` `[C:L4]` with the A3 apply flow. Node NIC: `ip link set <nic> up` `[R]` | **L3.** The cause is known and fixed (steps 5, 6, 16); no change record holds the port down on purpose; the affected jobs and leaves listed, the owners notified; change window | The link joins the fabric and the SM re-routes; a bad link can flap again and hit the jobs on the rail | Disable the port again the same way: `ibportstate <lid> <port> disable` `[R]`, or `nv set interface <swp> link state down` `[C:L4]` |
| A6 | Clear switch interface counters (to baseline a test) `[X:19]` | `nv action clear interface <swp> counters` or `nv action clear interface <swp> qos roce counters` | **L2.** **Capture `nv show interface <swp> counters` / `counters qos` and `perfquery -x` first**; this destroys evidence. Does not clear kernel/hardware counters | Counters restart from 0 | None |
| A7 | Module PRBS test on a link `[X:20]` | `mlxlink -d <dev> --port <n> --cable --prbs_select HOST --prbs_mode EN` (end with `--prbs_mode DS`) | **L3.** Link taken out of service; node drained; change window | **Link carries no traffic while PRBS is enabled** | `mlxlink -d <dev> --port <n> --cable --prbs_select HOST --prbs_mode DS` |
| A8 | Switch / NVOS firmware upgrade `[GAP:G08]` | (no command text; procedure: list the affected nodes (step 17); drain them (A9); UFM backup (A1); upgrade one leaf first as the canary; run section 9; then continue one switch at a time, spines last; stop at the first regression) | **L3.** Change window; UFM backup (A1); the affected-nodes list and the drain done | Fabric impact; some parts need AC power cycle | Roll back to the previous image per vendor procedure |

## 8. Evidence to collect

Evidence to capture before changing anything: `ibstat`, `iblinkinfo`, `ibnetdiscover`, `perfquery -x <lid>`, `mlxlink ... --cable`, `ibdiagnet` output, `ethtool -S <nic>`, switch `nv show interface <swp> counters qos`, `/opt/ufm/scripts/collect_logs.sh` output.
Also capture the UFM events near the fault, and `nv config show -o commands` `[R]` before a leaf change.

## 9. Return to service

Verify the fix:
1. `ibstat` shows `Active`/`LinkUp` at the expected rate; `iblinkinfo` shows every link at expected speed/width.
2. `perfquery -x <lid>` counters flat over a soak period; `ethtool -S <nic>` PFC/ECN/drops flat for RoCE.
3. `ib_write_bw -d <dev> -a` is at line rate; `rdma statistic` shows no growing retry errors.
4. `NCCL_DEBUG=INFO all_reduce_perf -b 8 -e 8G -f 2 -g <gpus>` meets the acceptance threshold (RB-02 / RB-08 return-to-service).
5. After a cable or optic change: `mlxlink -d <dev> -p <port>` `[C:L4]` is clean and `ibnetdiscover` `[C:L4]` matches the port map; the port map is updated (procedure L14).

## 10. Escalation

- **Internal:** L1 hands over to L2 at the end of section 3 with no fix, at once for P1 and P2. L2 hands over to L3 when the runbook ends with no fix, or when the fix needs more than a standard change ([shift-discipline.md](../handbook/shift-discipline.md#4-the-escalation)).
- Cable/transceiver replacement: the onsite dispatch (section 5 scenario, procedure L11), with `mlxlink` BER/optical readings.
- NVIDIA support (networking): `ibdiagnet` report, UFM log bundle, `mlxlink` output, switch `nv show platform` / `nv show system`, firmware versions.
- Attach UFM logs via `/opt/ufm/scripts/collect_logs.sh` and, for VAST storage fabrics, the storage-side `supportbundle` (RB-07).

## 11. Customer message

> **SEV1/SEV2 template — fabric fault:**
> "A <link / rail / fabric> fault is degrading network performance for job(s) <job-id(s)> on <nodes/rail>. Jobs continue at reduced speed (or will be rescheduled) while we repair the fabric under ticket <ticket-id>. Data and checkpoints are not affected: <verified / not verified yet>. Next update by <time: the update interval of the priority, see shift-discipline.md>."

## Appendix A — Gaps & open questions

- `[GAP:G05]` No command to show hardware tag-matching offload state on CX7 (tag-matching confusion with NCCL/OpenMPI is outside this runbook's evidence).
- `[GAP:G06]` OpenSM log path, `prism_an_lmc`, `lmc`, `lids_per_rtr` and `hm_ports_health_policy_file` have no documented command here.
- `[GAP:G07]` No gNMI client for per-channel PHY telemetry (signature 52); compare with `perfquery -x` only.
- `[GAP:G08]` No switch (NVOS/MLNX-OS) firmware upgrade or QM9700 upgrade-path commands.
- `[GAP:G13]` No guidance for switchless ring host chaining beyond `ibstat`, `ibnetdiscover`, `iblinkinfo`.
- `[GAP:G14]` The cheat sheet names DCGM profiling metrics (SM activity) but no command that prints them.
- `[GAP:G40]` No confirmed UFM command or REST call to enable a port that UFM disabled (for example an unhealthy port); use the UFM GUI.
- A Spectrum-X adaptive-routing check is not included: no command was confirmed.

## Appendix B — Source trace

| Step / claim | Guide section | Gist / external |
|---|---|---|
| Steps 1-2 layer L1 gate | R4, P (Job is slow) | L1 |
| Steps 3-5 | D (`ibstat` states), §7, P (Job is slow 3) | L4 `ibstat`, `iblinkinfo`, `perfquery -x`; §9 |
| Step 6 | §7 (`mlxlink -d <mst_dev> -p <port> --cable`) | L4 `mlxlink`; X20 |
| Steps 7-8 | §7 (UFM, OpenSM) | L4 `sminfo` (§11.4), `ufm_ha_cluster status`, `ufm_telemetry` |
| Step 9 | §7 | L4 `ibnetdiscover`, `ibdiagnet` |
| Steps 10-13 | §5 (`ib_write_bw` to separate fabric from NCCL), D (PFC/ECN) | §11.4 playbook; L4 `ethtool -S`, `nv show ... counters qos` |
| Steps 14-16 | catalogue N1, N7; M7 game day (NIC port at a lower speed) | L4 `ethtool <nic>`, `nv show interface <swp> link`, UFM REST; ethtool(8) |
| Step 17, A8 | catalogue N9, L5 | L4 `ibnetdiscover` |
| Onsite dispatch scenario | M7 game day (onsite dispatch) | onsite-procedures.md L11, L14, Dispatch |
| A1-A3, A9 | safety checklist, §7 state-changing | §10; Cumulus NVUE CLI (`nv config apply --confirm`, `nv config history`) |
| A5-A7 | §7 (CX8 port split, PRBS) | X09, X10, X19, X20 |
| A10 | M7 game day (one rail disabled) | infiniband-diags `ibportstate`; L4 `nv set` |
