# IB15 — Fabric change / SM recalculation

## Objective

Add real redundancy to a running fabric, live, without restarting `ibsim` or OpenSM.
Watch OpenSM discover the new switch and recompute routes on its own.

## Concepts learned

- `ibsim` can represent a switch that physically exists but has no cabling yet:
  a real, common state, racked, powered, and discoverable only once cabled,
  by declaring a node with zero port connections.
- The console's `Link` command can cable such a node in live.
  This lab uses that mechanism instead of restarting the simulator.
- A concrete, measured example of OpenSM re-routing existing traffic once a new path becomes available.

## Prerequisites

- IB10 (OpenSM's reaction to topology changes), IB06 (multi-path routing).

## Topology

[`topologies/fabric-change.net`](../topologies/fabric-change.net) — before any `Link` commands:

```
Hca1
 |
 S1
 |
 S2
 |
Hca2
```

`S3` also exists in this file, as a switch with zero connections: present but uncabled.
It becomes part of the fabric only once you link it in:

```
Hca1
 | \
 |  \
 S1  S3
 |  /
 | /
 S2
 |
Hca2
```

## Exact commands

```bash
cd 13-ibsim-real-fabric
./scripts/start-sim.sh fabric-change
./scripts/start-opensm.sh
sleep 1

./scripts/discover.sh -l                 # only S1, S2, Hca1, Hca2 -- S3 is invisible so far
./scripts/trace.sh 2 4                   # Hca1 -> Hca2's only path today (through S1, S2)

# Now cable S3 in, live, via the ibsim console:
docker exec ibsim-lab tmux send-keys -t ibsim 'Link "S3"[1] "Hca1"[2]' Enter
sleep 1
docker exec ibsim-lab tmux send-keys -t ibsim 'Link "S3"[2] "S2"[3]' Enter
sleep 2

docker exec ibsim-lab tail -n 15 /lab/opensm.log
./scripts/discover.sh -l                 # S3 should now appear
```

## Expected output

*Example output, captured live — exact LIDs may differ slightly by discovery order.*

Before linking, `discover.sh -l`:

```
Ca	 : 0x0000000000100003 ports 2 devid 0x0 vendid 0x0 "Hca2"
Ca	 : 0x0000000000100000 ports 2 devid 0x0 vendid 0x0 "Hca1"
Switch	 : 0x0000000000200002 ports 4 devid 0x0 vendid 0x0 "S2"
Switch	 : 0x0000000000200000 ports 4 devid 0x0 vendid 0x0 "S1"
```

Only 4 nodes appear.
`S3` exists in the topology file but has no links,
so neither `ibsim` nor OpenSM has any way to reach it yet.
This is realistic: an uncabled switch is not discoverable.

`trace.sh 2 4` (Hca1 → Hca2) before linking:

```
From ca {0x0000000000100000} portnum 1 lid 2-2 "Hca1"
[1] -> switch port {0x0000000000200000}[1] lid 1-1 "S1"
[2] -> switch port {0x0000000000200002}[2] lid 3-3 "S2"
[1] -> ca port {0x0000000000100004}[1] lid 4-4 "Hca2"
To ca {0x0000000000100003} portnum 1 lid 4-4 "Hca2"
```

After the two `Link` commands, OpenSM's log:

```
Sep 25 05:36:46 731042 [9F06F1A0] 0x01 -> log_trap_info: Received Generic Notice type:1 num:128 (Link state change) Producer:2 (Switch) from LID:3 TID:0x0000000000000000
```

A fresh `MASTER`/routing cycle follows, after OpenSM's next sweep, and `discover.sh -l` now shows:

```
Ca	 : 0x0000000000100003 ports 2 devid 0x0 vendid 0x0 "Hca2"
Ca	 : 0x0000000000100000 ports 2 devid 0x0 vendid 0x0 "Hca1"
Switch	 : 0x0000000000200001 ports 4 devid 0x0 vendid 0x0 "S3"
Switch	 : 0x0000000000200002 ports 4 devid 0x0 vendid 0x0 "S2"
Switch	 : 0x0000000000200000 ports 4 devid 0x0 vendid 0x0 "S1"
```

**S3 appeared, with no restart of `ibsim` or OpenSM.**
Re-run `trace.sh 2 4`.
The path may or may not change: with MinHop, and only 3 hops either way,
the tie-break can select either the new S3 leg or the original S1 leg.
What matters is that a path through S3 now exists, verifiable with `./scripts/routes.sh <S3's lid>`.

## What happened?

1. `ibsim` parsed a switch node (`S3`) with a port capacity but zero initial connections.
   This was a legitimate, static part of the topology file from the start,
   discoverable by nobody until something links to it.
2. Each `Link "nodeid"[port] "remoteid"[port]` console command created a real,
   bidirectional connection between two previously unconnected ports.
   It immediately changed both ports' physical state to `LinkUp`.
   This action is symmetric to `Unlink` (IB10) in the other direction.
3. `ibsim` raised the same kind of `Link state change` trap that IB10 saw for a link going down.
   A link coming up is also a topology change, and it triggers OpenSM the same way.
4. OpenSM's sweep discovered the newly reachable S3, assigned it a LID,
   and recomputed forwarding tables across the now larger topology.
   This is the same `ucast_mgr_route`/`osm_ucast_mgr_process` machinery from every previous lab,
   triggered here by growth instead of shrinkage.

## Verification checklist

- [ ] `discover.sh -l` shows only 4 nodes before linking
- [ ] `discover.sh -l` shows 5 nodes (S3 included) after both `Link` commands and a short wait
- [ ] OpenSM's log shows a `Link state change` trap after the `Link` commands
- [ ] `routes.sh <S3's lid>` shows a populated,
      valid forwarding table for S3 (proof it is fully integrated, not only visible)

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| S3 never appears | One of the two `Link` commands used the wrong port number/node name | Re-check against `topologies/fabric-change.net`'s comments; both ends of both links must match |
| `Link` command has no visible effect in the console output | Normal — `Link` is quiet on success, similar to `Unlink`/`ReLink` | Confirm via `discover.sh -l` / OpenSM's log instead of console text |

## Cleanup

```bash
./scripts/stop-sim.sh
```

## Optional challenge

Try the restart-based alternative instead: `./scripts/start-sim.sh fabric-change-before`.
Confirm the 4-node baseline, then stop it.
Run `./scripts/start-sim.sh fabric-change-after`,
and confirm that 5 nodes appear immediately, because OpenSM discovers a fresh,
already-5-node fabric from a cold start, with no "before" state to compare against.
What operational scenario does the live-Link method, this lab's main approach,
model that a full restart does not?

## Interview questions

1. **Beginner:** Why was S3 invisible to `ibnetdiscover` before the `Link` commands,
   even though it was already in the topology file?
2. **Intermediate:** What is the practical difference between restarting ibsim on a new topology file and linking a new node into a running one,
   in terms of what each teaches you about OpenSM's behavior?
3. **Senior SRE:** Real fabric expansions (adding a switch) involve physically racking and cabling hardware while the rest of the fabric stays up.
   Which of this lab's two methods (live-Link vs. restart) more realistically models that operational sequence,
   and why does that matter for anyone practicing a maintenance runbook?
