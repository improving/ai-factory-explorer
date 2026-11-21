# IB06 — Multi-path fabric

## Objective

Build a diamond topology with two independent switch-level paths between two HCAs.
Find out, empirically, which one OpenSM's routing engine uses, and why it uses only one, not both.

## Concepts learned

- InfiniBand's LID-based unicast forwarding has **no ECMP**:
  a given source/destination LID pair always takes exactly one path,
  chosen once by the routing engine when it builds the forwarding tables.
  It is not per-packet and not adaptive (without a specific adaptive-routing feature real hardware may offer,
  which `ibsim` does not model; see CAPABILITIES.md).
- Ethernet switching vs. IP routing vs. InfiniBand LID forwarding:
  three different address/forwarding models, explained below.

## Prerequisites

- IB02-IB05.

## Topology

[`topologies/multipath.net`](../topologies/multipath.net):

```
             Switch1
            /       \
           /         \
       Switch2       Switch3
           \         /
            \       /
             Switch4
            /        \
         Hca1        Hca2
```

Two equal-hop-count paths exist from Hca1 to Hca2:
`Switch1→Switch2→Switch4` and `Switch1→Switch3→Switch4`.

## Exact commands

```bash
cd 13-ibsim-real-fabric
./scripts/start-sim.sh multipath
./scripts/start-opensm.sh
./scripts/discover.sh -l                 # confirm 4 switches, 2 CAs, and note each switch's LID
./scripts/routes.sh 1                    # Switch1's forwarding table
./scripts/routes.sh 3                    # Switch2's forwarding table
./scripts/routes.sh 4                    # Switch3's forwarding table
./scripts/routes.sh 5                    # Switch4's forwarding table
./scripts/trace.sh 2 6                   # Hca1 (lid 2) -> Hca2 (lid 6)
```

**Before you run `routes.sh`/`trace.sh`:
predict which switch (Switch2 or Switch3) will carry the traffic, and write down your guess.**
There is no "load balancing" answer here: MinHop (the default engine) picks deterministically.

## Expected output

*Example output.
The specific LID numbers are deterministic for this file and OpenSM 3.3.23's MinHop engine.
A different routing engine (IB14) or OpenSM version could pick the other path.*

`./scripts/discover.sh -l`:

```
Ca	 : 0x0000000000100003 ports 2 devid 0x0 vendid 0x0 "Hca2"
Ca	 : 0x0000000000100000 ports 2 devid 0x0 vendid 0x0 "Hca1"
Switch	 : 0x0000000000200003 ports 8 devid 0x0 vendid 0x0 "Switch4"
Switch	 : 0x0000000000200002 ports 8 devid 0x0 vendid 0x0 "Switch3"
Switch	 : 0x0000000000200001 ports 8 devid 0x0 vendid 0x0 "Switch2"
Switch	 : 0x0000000000200000 ports 8 devid 0x0 vendid 0x0 "Switch1"
```

LIDs (from a full `discover.sh`): Switch1=1, Hca1=2, Switch2=3, Switch3=4, Switch4=5, Hca2=6.

`./scripts/routes.sh 1` (Switch1's table: the decision point):

```
Unicast lids [0x0-0x6] of switch Lid 1 guid 0x0000000000200000 (Switch1):
  Lid  Out   Destination
       Port     Info 
0x0001 000 : (Switch portguid 0x0000000000200000: 'Switch1')
0x0002 001 : (Channel Adapter portguid 0x0000000000100001: 'Hca1')
0x0003 002 : (Switch portguid 0x0000000000200001: 'Switch2')
0x0004 003 : (Switch portguid 0x0000000000200002: 'Switch3')
0x0005 003 : (Switch portguid 0x0000000000200003: 'Switch4')
0x0006 002 : (Channel Adapter portguid 0x0000000000100004: 'Hca2')
6 valid lids dumped 
```

**Lid 0x0006 (Hca2) routes out port 002: the link to Switch2.**
Switch3 (port 003) is never used for this destination.

`./scripts/trace.sh 2 6` confirms the same path end to end:

```
From ca {0x0000000000100000} portnum 1 lid 2-2 "Hca1"
[1] -> switch port {0x0000000000200000}[1] lid 1-1 "Switch1"
[2] -> switch port {0x0000000000200001}[1] lid 3-3 "Switch2"
[2] -> switch port {0x0000000000200003}[1] lid 5-5 "Switch4"
[3] -> ca port {0x0000000000100004}[1] lid 6-6 "Hca2"
To ca {0x0000000000100003} portnum 1 lid 6-6 "Hca2"
```

Hca1 → Switch1 → **Switch2** → Switch4 → Hca2.
Switch3 carries zero traffic for this source/destination pair, permanently,
until something changes the topology or the routing engine.

## Why not "both paths, load-balanced"? Ethernet vs. IP vs. InfiniBand forwarding

| | Ethernet switching | IP routing | InfiniBand LID forwarding |
|---|---|---|---|
| **Address used to forward** | MAC address (flat, learned) | IP address (hierarchical, longest-prefix match) | LID (flat, SM-assigned) |
| **Multiple equal paths** | Handled by STP (blocks one) or MLAG/vPC workarounds: traditionally one active path per VLAN | ECMP: per-flow (usually 5-tuple hash) load-balancing across paths, computed independently at every hop | **One path per LID pair, computed centrally by the SM**, and pushed to every switch's forwarding table. No per-flow hashing exists in the base (non-adaptive) model |
| **Who decides the path** | Distributed (STP/learning) | Distributed (every router runs its own routing protocol) | **Centralized**: the SM alone computes and installs every switch's table |
| **What IB06 demonstrates** | N/A | N/A | Exactly this: MinHop chose Switch2 once, for good, until re-routed |

If you need load spreading across Switch2 and Switch3 in real InfiniBand,
that is a routing *engine* choice (for example,
some engines and LMC>0 configurations spread different LIDs of a multi-LID port across different paths).
It is not something that happens automatically, the way ECMP does in IP.
IB14 revisits this with a different routing engine.

## What happened?

1. OpenSM's MinHop engine computed hop counts from every switch to every LID.
   It found Switch2 and Switch3 tied at 1 extra hop from Switch1,
   and broke the tie using its internal ordering (in this engine,
   effectively discovery/GUID order), deterministically, not randomly.
2. OpenSM wrote that decision once into Switch1's (and Switch2's and Switch4's) forwarding tables,
   as a `SET(LinearForwardingTable)` MAD during the `MASTER` sweep.
   This is the same mechanism IB04 watched happen for the two-node case.
3. `ibtracert` did not re-decide anything.
   It read the already-installed forwarding tables hop by hop, and printed the path they encode.

## Verification checklist

- [ ] `routes.sh 1` shows lid 6 routed out a single port (not split)
- [ ] `trace.sh 2 6` shows a path through exactly one of Switch2/Switch3, not both
- [ ] Re-running `trace.sh 2 6` after restarting OpenSM (without changing topology) gives the *same* path,
      confirming this is deterministic, not per-run random

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `routes.sh`/`trace.sh` shows different LIDs than this doc | LID assignment order differs (for example, you started `opensm` before all nodes settled) | Re-run `discover.sh` first to get this run's actual LID map, then substitute |
| Both Switch2 and Switch3 look "used" across different tests | You are looking at routes to *different* destination LIDs, each individually still single-path | Check the routing table for one specific destination LID, not the whole table |

## Cleanup

```bash
./scripts/stop-sim.sh
```

## Optional challenge

Run `./scripts/routes.sh 4` (Switch3's own table),
and explain why it still has a valid entry for lid 6 (Hca2),
even though Switch3 is not on the active path for traffic *originating* at Hca1.
(Hint: Switch3's table only matters for traffic that arrives at Switch3.
From where, in this topology?)

## Interview questions

*(asked again, consolidated, after IB08)*

1. **Beginner:** Why does InfiniBand not automatically split traffic across Switch2 and Switch3 the way ECMP would in an IP network?
2. **Intermediate:** What IB mechanism *can* create multiple active paths for what looks like "the same" source/destination,
   and what has to be true about the topology and configuration for it to help?
3. **Senior SRE:** If Switch2 becomes congested while Switch3 sits idle,
   what are your options in InfiniBand,
   given that routing decisions are centralized and static until OpenSM re-sweeps?
