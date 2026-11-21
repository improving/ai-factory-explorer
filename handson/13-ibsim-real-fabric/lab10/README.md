# IB10 — Link failure simulation

## Objective

Break the single inter-switch link in a two-switch fabric,
watch OpenSM detect and react to it in real time, then restore it and confirm the fabric heals.

## Concepts learned

- `ibsim`'s `Unlink`/`ReLink` console commands do flip a simulated port's state (CAPABILITIES.md).
- OpenSM's real reaction to a topology change: trap reception, port removal,
  re-routing, `SUBNET UP` again.
- The practical meaning of "the fabric partitioned."

## Prerequisites

- IB05 (`two-switch.net`), IB04 (reading OpenSM logs).

## Topology

[`topologies/two-switch.net`](../topologies/two-switch.net) —
the single-ISL topology from IB05, chosen specifically because it has no redundancy:
breaking the one Switch1↔Switch2 link **partitions** the fabric into two islands.

## Exact commands

```bash
cd 13-ibsim-real-fabric
./scripts/start-sim.sh two-switch
./scripts/start-opensm.sh
./scripts/discover.sh -l                        # baseline: 2 switches, 4 CAs

./scripts/inject-failure.sh '"Switch1"[3]'      # break the ISL
sleep 2
docker exec ibsim-lab tail -n 15 /lab/opensm.log
./scripts/discover.sh -l                        # what's reachable now?

./scripts/restore-link.sh '"Switch1"[3]'        # bring it back
sleep 2
docker exec ibsim-lab tail -n 15 /lab/opensm.log
./scripts/discover.sh -l                        # confirm full recovery
```

## Expected output

*Example output, captured live; exact timestamps and thread IDs will differ.*

Baseline `discover.sh -l`: 2 switches + 4 CAs (Hca1-4), as in IB05.

After `inject-failure.sh '"Switch1"[3]'`, OpenSM's log:

```
Sep 25 05:30:23 853151 [B617F1A0] 0x01 -> log_trap_info: Received Generic Notice type:1 num:128 (Link state change) Producer:2 (Switch) from LID:1 TID:0x0000000000000000
Sep 25 05:30:23 853205 [B617F1A0] 0x02 -> SM class trap 128: Directed Path Dump of 0 hop path: Path = 0
Sep 25 05:30:23 853219 [B617F1A0] 0x02 -> log_notice: Reporting Urgent Notice "Link state change" from switch LID 1, GUID 0x0000000000200000
Sep 25 05:30:23 854736 [B311F1A0] 0x02 -> log_notice: Reporting Informational Notice "GID out of service", GID:fe80::20:1
Sep 25 05:30:23 854744 [B311F1A0] 0x02 -> drop_mgr_remove_port: Removed port with GUID:0x0000000000200001 LID range [3, 3] of node:Switch2
Sep 25 05:30:23 854766 [B311F1A0] 0x02 -> log_notice: Reporting Informational Notice "GID out of service", GID:fe80::10:7
Sep 25 05:30:23 854769 [B311F1A0] 0x02 -> drop_mgr_remove_port: Removed port with GUID:0x0000000000100007 LID range [5, 5] of node:Hca3
Sep 25 05:30:23 854770 [B311F1A0] 0x02 -> log_notice: Reporting Informational Notice "GID out of service", GID:fe80::10:a
Sep 25 05:30:23 854772 [B311F1A0] 0x02 -> drop_mgr_remove_port: Removed port with GUID:0x000000000010000a LID range [6, 6] of node:Hca4
Sep 25 05:30:23 855830 [B311F1A0] 0x02 -> osm_ucast_mgr_process: minhop tables configured on all switches
Sep 25 05:30:23 856098 [B311F1A0] 0x02 -> SUBNET UP
```

`discover.sh -l` right after — **Switch2, Hca3, and Hca4 are gone**:

```
Ca	 : 0x0000000000100003 ports 2 devid 0x0 vendid 0x0 "Hca2"
Ca	 : 0x0000000000100000 ports 2 devid 0x0 vendid 0x0 "Hca1"
Switch	 : 0x0000000000200000 ports 8 devid 0x0 vendid 0x0 "Switch1"
```

After `restore-link.sh '"Switch1"[3]'`, OpenSM logs a second `Link state change` trap,
re-sweeps, and `discover.sh -l` shows all 6 nodes again, as in the baseline.

## What happened?

1. `Unlink "Switch1"[3]` set that port's physical and logical state to `Down`/`Polling` inside `ibsim`.
   This is a real state change: the simulated fabric enforces it on every subsequent MAD,
   not only a log message.
2. `ibsim` generated a real `Notice`/trap (`type:1 num:128`,
   "Link state change") toward the SM, the same way a real switch's SMA would on a link-down event.
3. OpenSM received the trap and ran a **light** re-sweep.
   It did not need the full `HEAVY SWEEP` from IB04,
   because it already knows the topology and only needs to find what changed.
   It determined that Switch2 (and everything reachable only through it) was unreachable from its own vantage point,
   and issued `drop_mgr_remove_port` for each: Switch2 itself, and Hca3/Hca4 behind it.
4. It re-ran the routing engine (`osm_ucast_mgr_process: minhop tables configured on all switches`) over the now-smaller reachable graph and declared `SUBNET UP` again,
   for the surviving island only.
5. `ReLink` reversed the physical state change, triggered a second trap,
   and OpenSM's next sweep re-discovered Switch2/Hca3/Hca4,
   the same way it did the first time in IB04/IB05.

## Verification checklist

- [ ] Baseline `discover.sh -l` shows all 6 nodes
- [ ] After `inject-failure.sh`, OpenSM's log shows a `Link state change` trap and `drop_mgr_remove_port` lines
- [ ] `discover.sh -l` after the failure shows only Switch1, Hca1, Hca2; Switch2/Hca3/Hca4 are gone
- [ ] After `restore-link.sh`, all 6 nodes reappear in `discover.sh -l`

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Nodes do not disappear after `inject-failure.sh` | Wrong port unlinked (e.g., a host port instead of the ISL) | Double check the port argument against `topologies/two-switch.net`; the ISL is `"Switch1"[3]`/`"Switch2"[3]` |
| OpenSM's log does not show a trap | OpenSM is not running, or died | Re-run `start-opensm.sh`; check `docker exec ibsim-lab pgrep -a opensm` |
| Nodes do not come back after `restore-link.sh` | OpenSM has not re-swept yet | Wait a couple seconds and re-run `discover.sh`; OpenSM's sweep interval is not instantaneous |

## Cleanup

```bash
./scripts/stop-sim.sh
```

## Optional challenge

Instead of the ISL, unlink one of Hca1's own ports (`"Hca1"[1]`).
Confirm that only Hca1 disappears from discovery,
and every other node (including Switch2's side) is unaffected.
A single-host failure affects far fewer nodes than an ISL failure,
as you would expect operationally.

## Interview questions

*(asked again, consolidated after IB12)*

1. **Beginner:** Why did breaking the ISL make Switch2, Hca3,
   and Hca4 all disappear from discovery, not only the link itself?
2. **Intermediate:** What is the difference between OpenSM's reaction here (a light,
   trap-driven re-sweep) and the full `HEAVY SWEEP` you saw at initial startup in IB04?
3. **Senior SRE:** In a real fabric, what would you check, in order,
   if `ibnetdiscover` suddenly showed several nodes missing that were present an hour ago?
