# IB16 — Build a larger data center fabric

## Objective

Discover, route, and fail-test a realistically shaped 2-tier Clos fabric:
2 spines, 4 leaves, 12 HCAs.
See the resilience that a real spine/leaf design provides.

## Concepts learned

- Reading a larger `ibnetdiscover` dump without getting lost.
- Why losing one spine (in a fabric with 2 or more) degrades bandwidth but does **not** partition anything,
  in sharp contrast to IB10's single-ISL topology,
  where losing the one link partitioned the fabric outright.
- A subtlety of `ibsim`/`libumad2sim`: the diagnostic client's own attachment point matters.

## Prerequisites

- IB06, IB10, IB14.

## Topology

[`topologies/datacenter.net`](../topologies/datacenter.net):

```
                     Spine1              Spine2
                    /  |  |  \          /  |  |  \
                   /   |  |   \        /   |  |   \
                Leaf1 Leaf2 Leaf3 Leaf4   (each leaf uplinks to BOTH spines)
                 /|\   /|\   /|\   /|\
                H H H H H H H H H H H H
```

12 HCAs (`Hca01`-`Hca12`), 3 per leaf; every leaf has one uplink to each spine.

## Exact commands

```bash
cd 13-ibsim-real-fabric
./scripts/start-sim.sh datacenter
./scripts/start-opensm.sh
sleep 1
./scripts/discover.sh -l                 # 18 nodes: 2 spines, 4 leaves, 12 CAs
./scripts/trace.sh 2 16                  # Hca01 -> Hca10 (different leaves, crosses a spine)
```

Now fail an entire spine (all four of its leaf-facing ports) and confirm the fabric survives:

```bash
for p in 1 2 3 4; do
  docker exec ibsim-lab tmux send-keys -t ibsim "Unlink \"Spine2\"[$p]" Enter
done
sleep 2
./scripts/discover.sh -l                 # Spine2 is gone -- everything else should still be there
./scripts/trace.sh 2 16                  # still works?
```

## Expected output

Baseline `discover.sh -l` (18 nodes):

```
Ca	 : 0x0000000000100021 ports 2 devid 0x0 vendid 0x0 "Hca12"
...(all 12 Hca## lines)...
Switch	 : 0x0000000000200001 ports 8 devid 0x0 vendid 0x0 "Spine2"
Switch	 : 0x0000000000200005 ports 8 devid 0x0 vendid 0x0 "Leaf4"
Switch	 : 0x0000000000200004 ports 8 devid 0x0 vendid 0x0 "Leaf3"
Switch	 : 0x0000000000200003 ports 8 devid 0x0 vendid 0x0 "Leaf2"
Switch	 : 0x0000000000200002 ports 8 devid 0x0 vendid 0x0 "Leaf1"
Switch	 : 0x0000000000200000 ports 8 devid 0x0 vendid 0x0 "Spine1"
```

`trace.sh 2 16` (Hca01 → Hca10, crossing Spine1 with MinHop's tie-break):

```
From ca {0x0000000000100000} portnum 1 lid 2-2 "Hca01"
[1] -> switch port {0x0000000000200002}[1] lid 4-4 "Leaf1"
[5] -> switch port {0x0000000000200000}[1] lid 1-1 "Spine1"
[4] -> switch port {0x0000000000200005}[5] lid 8-8 "Leaf4"
[1] -> ca port {0x000000000010001c}[1] lid 16-16 "Hca10"
To ca {0x000000000010001b} portnum 1 lid 16-16 "Hca10"
```

**After failing all of Spine2's uplinks:** `discover.sh -l` shows **17 nodes —
Spine2 alone is gone, every leaf and every HCA is still there:**

```
Ca	 : 0x0000000000100021 ports 2 devid 0x0 vendid 0x0 "Hca12"
...(all 12 Hca## lines, unchanged)...
Switch	 : 0x0000000000200005 ports 8 devid 0x0 vendid 0x0 "Leaf4"
Switch	 : 0x0000000000200004 ports 8 devid 0x0 vendid 0x0 "Leaf3"
Switch	 : 0x0000000000200003 ports 8 devid 0x0 vendid 0x0 "Leaf2"
Switch	 : 0x0000000000200002 ports 8 devid 0x0 vendid 0x0 "Leaf1"
Switch	 : 0x0000000000200000 ports 8 devid 0x0 vendid 0x0 "Spine1"
```

And `trace.sh 2 16` **still succeeds**, now necessarily via Spine1 (the only spine left):

```
From ca {0x0000000000100000} portnum 1 lid 2-2 "Hca01"
[1] -> switch port {0x0000000000200002}[1] lid 4-4 "Leaf1"
[5] -> switch port {0x0000000000200000}[1] lid 1-1 "Spine1"
[4] -> switch port {0x0000000000200005}[5] lid 8-8 "Leaf4"
[1] -> ca port {0x000000000010001c}[1] lid 16-16 "Hca10"
To ca {0x000000000010001b} portnum 1 lid 16-16 "Hca10"
```

Compare this directly with IB10, where losing the only ISL made 3 of the 6 nodes vanish entirely.
Here, losing an entire spine switch, proportionally a much bigger failure,
did not disconnect a single host.
That result is the purpose of a 2-tier Clos design with 2 or more spines.

## A subtlety worth knowing: the diagnostic client's attachment point

If you instead fail **Spine1** (try it as the optional challenge below) using the same technique,
`discover.sh` reports, misleadingly, almost nothing reachable.
The rest of the fabric has not died.
`ibnetdiscover`'s own `LD_PRELOAD` client attaches at whichever node is first in the topology file (`SIM_HOST`,
per ARCHITECTURE.md §6), and for `datacenter.net` that node is Spine1 itself.
When your own vantage point is isolated, everything looks unreachable from it.
That result is not a fabric failure;
it means you cut the cable your own diagnostic client was standing on.
Real diagnostic tooling on real hardware has the same blind spot if it runs on the thing that failed.
This is why out-of-band management matters operationally.

## What happened?

1. OpenSM's routing engine, when it originally computed forwarding tables,
   had already spread traffic across both spines for different LID pairs (per MinHop's tie-breaking,
   the same mechanism as IB06).
2. Unlinking all 4 of Spine2's ports triggered 4 `Link state change` traps.
   OpenSM's re-sweep found Spine2 completely unreachable and removed it,
   then recomputed every forwarding table that had previously used Spine2,
   re-routing that traffic through Spine1 instead.
3. No host ever lost its only path, because every leaf always had two spine uplinks to begin with.
   This outcome is a direct, structural consequence of the topology,
   not something OpenSM had to handle specially.

## Verification checklist

- [ ] Baseline shows 18 nodes
- [ ] After failing Spine2, exactly 17 nodes remain (Spine2 gone, nothing else)
- [ ] `trace.sh 2 16` succeeds both before and after, using Spine1 in the "after" case

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Almost everything looks unreachable after a spine failure | You failed Spine1 (the attach point), not Spine2 — see the subtlety above | Use Spine2 for a clean single-spine-failure demo, or attach your diagnostic client elsewhere (out of scope for this module's scripts, which always attach at the topology file's first node) |
| Node count does not drop by exactly 1 | Not all 4 of Spine2's ports were unlinked | Re-check all 4 `tmux send-keys` commands ran (watch `discover.sh -l`'s count before assuming) |

## Cleanup

```bash
./scripts/stop-sim.sh
```

## Optional challenge

Deliberately fail Spine1 (the attach point) instead of Spine2.
Observe the misleading "everything is unreachable" result.
Explain, in your own words, why that result is a client-attachment artifact and not evidence that the fabric partitioned.
Then try to confirm the fabric's actual state despite that: you cannot,
from this container's default attachment point.
This is a genuine, stated limitation of how this module's scripts work,
not a question with a clean answer.

## Interview questions

*(consolidated, covering IB13-IB16)*

1. **Beginner:** Why does losing one spine in this topology not disconnect any host,
   while losing the one ISL in IB10's topology disconnected three nodes?
2. **Intermediate:** What would need to be true about a leaf's uplinks for losing one spine to still cause a partition?
3. **Senior SRE:** In production, would you rather lose a leaf switch or a spine switch,
   all else being equal, and why.
   Think in terms of blast radius (hosts affected) versus remaining capacity (bandwidth available to survivors).
4. **Senior infrastructure engineer:** This lab's "diagnostic client's own attachment point" subtlety has a real-world analogue in monitoring systems.
   Name one example (for instance,
   a monitoring agent that goes dark exactly when the thing it monitors fails) and explain the parallel.
