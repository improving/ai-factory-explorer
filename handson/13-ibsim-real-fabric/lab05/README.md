# IB05 — Two-switch fabric

## Objective

Build and discover a fabric with two switches and four HCAs.
See how the topology, GUIDs, and routing change,
compared to the single-switch IB02/IB03/IB04 fabric.

## Concepts learned

- Multi-switch discovery and LID assignment.
- Reading `ibnetdiscover`'s full-record output (not only `-l`) for a multi-hop fabric.
- Why this topology is a single point of failure by construction (setup for IB10).

## Prerequisites

- IB02-IB04.

## Topology

[`topologies/two-switch.net`](../topologies/two-switch.net):

```
  Hca1   Hca2
    \    /
   Switch1
      |
   Switch2
    /    \
  Hca3   Hca4
```

Exactly **one** link connects Switch1 and Switch2: no redundancy.
Contrast with IB06.

## Exact commands

```bash
cd 13-ibsim-real-fabric
./scripts/start-sim.sh two-switch
./scripts/start-opensm.sh
./scripts/discover.sh
```

## Expected output

*Example output.
Exact GUIDs and LIDs are deterministic for this exact file and OpenSM version,
but in general, treat them as "look them up" values.*

```
ibwarn: [71] sim_connect: attached as client 1 at node "Switch1"
#
# Topology file: generated on Fri Sep 25 05:24:53 2026
#
# Initiated from node 0000000000200000 port 0000000000200000

vendid=0x0
devid=0x0
sysimgguid=0x200001
switchguid=0x200001(200001)
Switch	8 "S-0000000000200001"		# "Switch2" base port 0 lid 3 lmc 0
[1]	"H-0000000000100006"[1](100007) 		# "Hca3" lid 5 4xSDR
[2]	"H-0000000000100009"[1](10000a) 		# "Hca4" lid 6 4xSDR
[3]	"S-0000000000200000"[3]		# "Switch1" lid 1 4xSDR

vendid=0x0
devid=0x0
sysimgguid=0x200000
switchguid=0x200000(200000)
Switch	8 "S-0000000000200000"		# "Switch1" base port 0 lid 1 lmc 0
[1]	"H-0000000000100000"[1](100001) 		# "Hca1" lid 2 4xSDR
[2]	"H-0000000000100003"[1](100004) 		# "Hca2" lid 4 4xSDR
[3]	"S-0000000000200001"[3]		# "Switch2" lid 3 4xSDR

vendid=0x0
devid=0x0
sysimgguid=0x100009
caguid=0x100009
Ca	2 "H-0000000000100009"		# "Hca4"
[1](10000a) 	"S-0000000000200001"[2]		# lid 6 lmc 0 "Switch2" lid 3 4xSDR

vendid=0x0
devid=0x0
sysimgguid=0x100006
caguid=0x100006
Ca	2 "H-0000000000100006"		# "Hca3"
[1](100007) 	"S-0000000000200001"[1]		# lid 5 lmc 0 "Switch2" lid 3 4xSDR

vendid=0x0
devid=0x0
sysimgguid=0x100003
caguid=0x100003
Ca	2 "H-0000000000100003"		# "Hca2"
[1](100004) 	"S-0000000000200000"[2]		# lid 4 lmc 0 "Switch1" lid 1 4xSDR

vendid=0x0
devid=0x0
sysimgguid=0x100000
caguid=0x100000
Ca	2 "H-0000000000100000"		# "Hca1"
[1](100001) 	"S-0000000000200000"[1]		# lid 2 lmc 0 "Switch1" lid 1 4xSDR
```

## How this differs from IB02's single-switch fabric

- Two `switchguid` records instead of one: Switch1 (`0x200000`) and Switch2 (`0x200001`).
- Switch1's port 3 and Switch2's port 3 reference each other (`"S-...200001"[3]` / `"S-...200000"[3]`).
  This is the inter-switch link (ISL).
  Every future lab with this pair of switches treats it as the single point of failure.
- LIDs now span 1-6 (Switch2's 1 switch management LID is not shown,
  because only the SM's own port gets the special "our SM" LID range;
  Switch2 does not need one to forward traffic).
- OpenSM assigned Switch1 lid 1 (it is bound there), and discovered Switch2 as lid 3;
  LID assignment order follows discovery order, which follows the topology file's node order,
  plus BFS from the SM's own port.

## What happened?

1. OpenSM's `DISCOVERING` sweep started at Switch1 (where it is bound),
   found Hca1/Hca2 directly, then crossed the Switch1↔Switch2 ISL (port 3 on both ends) to discover Switch2,
   then Hca3/Hca4 behind it.
   This is a real multi-hop SMP walk, not a flat scan.
2. Because there is only one path from Switch1 to Switch2,
   OpenSM's routing engine had exactly one choice for every LID behind Switch2.
   There is nothing to compare yet (IB06 changes that).
3. `ibnetdiscover` (run independently afterward) rebuilt the same graph from scratch through its own SMP walk.
   The fact that it agrees with what OpenSM assigned is itself a form of verification.

## Verification checklist

- [ ] `discover.sh` shows 2 switches, 4 CAs
- [ ] Switch1 port 3 and Switch2 port 3 reference each other
- [ ] Every CA has a non-zero LID

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Only Switch1's side (Hca1, Hca2) discovered | OpenSM/`ibnetdiscover` ran before it swept past the ISL, or the ISL is down | Re-run after a couple seconds. Check `iblinkinfo` for the ISL's state |
| GUIDs do not match this doc | You edited the topology file, or ibsim's version differs | Compare against `topologies/two-switch.net` as checked into this repo |

## Cleanup

```bash
./scripts/stop-sim.sh
```

## Optional challenge

Predict, before you run it, what `ibswitches` and `ibhosts` (two narrower `infiniband-diags` tools) will print for this topology.
Then run them:

```bash
docker exec ibsim-lab bash -c 'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO ibswitches'
docker exec ibsim-lab bash -c 'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO ibhosts'
```

## Interview questions

*(asked again, consolidated, after IB08)*

1. **Beginner:** How many hops does a packet from Hca1 to Hca4 need to cross,
   and how do you read that off the topology dump?
2. **Intermediate:** What makes the Switch1↔Switch2 link an inter-switch link (ISL) rather than "a port," architecturally?
3. **Senior SRE:** This topology has zero redundancy at the switch tier.
   What is the blast radius of losing the single ISL, exactly (which hosts lose contact with which)?
