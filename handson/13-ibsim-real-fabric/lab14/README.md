# IB14 — Advanced OpenSM routing engines

## Objective

Switch OpenSM's routing engine.
Prove, with a real forwarding-table diff, that the change altered how traffic is routed.
Do not only confirm that the flag was accepted.

## Concepts learned

- OpenSM supports multiple routing engines beyond the default MinHop.
  The full list this installed build supports (from `opensm --help`,
  `--routing_engine`) is: `updn`, `dnup`, `file`, `ftree`, `lash`, `dor`,
  `torus-2QoS`, `nue`, `dfsssp`, `sssp`.
  MinHop remains the fallback for everything by default.
- `ftree` (fat-tree) routing is the natural fit for the spine and leaf shape of `topologies/datacenter.net`.

## Prerequisites

- IB06, IB08 (reading forwarding tables), IB16.
  This lab reuses `datacenter.net` early.
  Read IB16's topology description first, or proceed directly, because the topology is simple.

## Topology

[`topologies/datacenter.net`](../topologies/datacenter.net) — 2 spines, 4 leaves, 12 HCAs.

## Exact commands

First, run the default (MinHop) baseline:

```bash
cd 13-ibsim-real-fabric
./scripts/start-sim.sh datacenter
./scripts/start-opensm.sh
sleep 1
./scripts/routes.sh 4          # Leaf1's forwarding table (Leaf1 = lid 4 in this topology)
./scripts/stop-sim.sh
```

Now run the same fabric with `ftree` selected explicitly:

```bash
./scripts/start-sim.sh datacenter
docker exec ibsim-lab bash -c \
  'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO nohup opensm -f /lab/opensm.log -B -R ftree > /lab/opensm.out 2>&1 & disown'
sleep 2
./scripts/routes.sh 4
```

## Expected output

**MinHop** (Leaf1's table, lid 4):

```
Unicast lids [0x0-0x12] of switch Lid 4 guid 0x0000000000200002 (Leaf1):
  Lid  Out   Destination
       Port     Info 
0x0001 005 : (Switch portguid 0x0000000000200000: 'Spine1')
0x0002 001 : (Channel Adapter portguid 0x0000000000100001: 'Hca01')
0x0003 006 : (Switch portguid 0x0000000000200001: 'Spine2')
0x0004 000 : (Switch portguid 0x0000000000200002: 'Leaf1')
...
0x000d 006 : (Channel Adapter portguid 0x0000000000100013: 'Hca07')
...
18 valid lids dumped 
```

**ftree**, same switch, same destination LID (`0x000d`, Hca07):

```
Unicast lids [0x0-0x12] of switch Lid 4 guid 0x0000000000200002 (Leaf1):
  Lid  Out   Destination
       Port     Info 
0x0001 005 : (Switch portguid 0x0000000000200000: 'Spine1')
0x0002 001 : (Channel Adapter portguid 0x0000000000100001: 'Hca01')
0x0003 006 : ...
...
0x000d 005 : (Channel Adapter portguid 0x0000000000100013: 'Hca07')
...
18 valid lids dumped 
```

**LID `0x000d` (Hca07, behind Leaf3) routes out port 006 (Spine2) under MinHop,
but out port 005 (Spine1) under ftree.**
The fabric, the HCA, and the running `ibsim` instance are the same,
rebuilt from the same topology file.
Only the routing engine changed,
and that single change moved this destination's traffic to the other spine.

The OpenSM log confirms which engine ran:

```
Sep 25 05:34:40 837585 [8B8BF1A0] 0x04 -> do_routing: Starting FatTree routing
Sep 25 05:34:40 837586 [8B8BF1A0] 0x04 -> do_routing: Filling switch forwarding tables for Compute Nodes
Sep 25 05:34:40 837589 [8B8BF1A0] 0x04 -> do_routing: Filling switch forwarding tables for non-CN targets
Sep 25 05:34:40 837590 [8B8BF1A0] 0x04 -> do_routing: Filling switch forwarding tables for switch-to-switch paths
Sep 25 05:34:40 837861 [8B8BF1A0] 0x04 -> do_routing: FatTree routing is done
Sep 25 05:34:40 837872 [8B8BF1A0] 0x02 -> osm_ucast_mgr_process: ftree tables configured on all switches
```

The `ftree` engine classified this topology's roots (spines) and leaves from the link shape alone.
No extra annotation was needed in `datacenter.net`, because the topology is this regular.

## MinHop vs. ftree, conceptually

- **MinHop** (the default): minimizes the hop count from every switch to every LID, globally.
  Ties break by an internal, deterministic order (IB06).
  MinHop has no concept of a spine or a leaf.
  It computes the same kind of table for an irregular, non-Clos topology.
- **ftree**: built for fat-tree and Clos topologies.
  It models the up and down structure directly:
  a leaf routes up toward the spines for any destination that is not local,
  and a spine routes down toward the correct leaf. ftree spreads load evenly across the available spines,
  instead of always preferring the same spine for a tied case.
  This spread is the difference you measured for Hca07.

## What happened?

1. `-R ftree` told OpenSM to try the `ftree` engine first.
   MinHop is the automatic fallback if `ftree` engine setup fails.
   Setup did not fail here:
   the log line `setup_routing_engine: setup of routing engine 'ftree'` shows success.
2. The OpenSM fat-tree engine walked the discovered topology.
   It classified switches into tiers by their connectivity pattern:
   a leaf connects to both HCAs and spines, and a spine connects only to leaves.
   It computed forwarding tables that balance traffic across the spine tier.
3. It issued the same kind of `Set(LinearForwardingTable)` MADs that MinHop always issues.
   The mechanism for programming a switch is identical for every engine.
   Only the computed values differ.

## Verification checklist

- [ ] Baseline (MinHop) run shows lid `0x000d` (Hca07) routed via port 006
- [ ] `ftree` run shows the same lid routed via port 005 instead
- [ ] OpenSM's log shows `do_routing: Starting FatTree routing` / `FatTree routing is done` when `-R ftree` is used

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ibroute`/`smpquery` briefly fails with `mad_rpc: ... failed` right after switching engines | The query ran mid-sweep, before OpenSM finished installing the new tables | Wait a second, then retry. This is a transient timing issue, not a routing bug |
| ftree table looks identical to MinHop's | Possible for some destinations, because both engines still minimize hops on the shortest common path — check a LID that is not on that path, like this lab's Hca07 example | Compare several LIDs, not only one, before you conclude there is no difference |

## Cleanup

```bash
./scripts/stop-sim.sh
```

## Optional challenge

Try `-R updn` on `topologies/multipath.net` (IB06's diamond).
Confirm, or refute, whether it picks a different path than MinHop did for Hca1→Hca2.
In this module's testing, `updn` agreed with MinHop on that specific small diamond.
A different engine does not guarantee a different result for every topology.
It can differ, as the ftree datacenter result proved.

## Interview questions

*(consolidated, after IB16)*

1. **Beginner:** Name two OpenSM routing engines, other than the default,
   from this module's own verified `opensm --help` output.
2. **Intermediate:** Why is `ftree` well suited to the shape of `datacenter.net`,
   but not necessarily to the shape of `multipath.net`?
3. **Senior infrastructure engineer:** A production GPU cluster's fabric team wants to switch routing engines to improve load distribution across spines.
   What would you verify, with the tools from this module, before and after the change,
   in a maintenance window, to confirm the change did not break reachability to any host?
