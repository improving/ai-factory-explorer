# IB07 — `ibnetdiscover` deep dive

## Objective

Read `ibnetdiscover`'s full output format well enough to answer topology questions without re-running extra commands.
Understand how the discovery walk itself works.

## Concepts learned

- Every field in `ibnetdiscover`'s default (non `-l`) output.
- Directed-route (DR) discovery order, and how it is visible with `-s`.
- `ibnetdiscover`'s narrower siblings: `ibswitches`, `ibhosts`.

## Prerequisites

- IB05 (this lab reuses `two-switch.net`).

## Topology

[`topologies/two-switch.net`](../topologies/two-switch.net) — same as IB05.

## Exact commands

```bash
cd 13-ibsim-real-fabric
./scripts/start-sim.sh two-switch
./scripts/start-opensm.sh
./scripts/discover.sh -s          # -s: show the discovery walk itself (directed routes)
./scripts/discover.sh             # full output
```

## Expected output

`./scripts/discover.sh -s` (the discovery walk: this is the same mechanism IB02 described,
with `-s` making it visible):

```
ibwarn: [71] sim_connect: attached as client 1 at node "Switch1"
DR path slid 0; dlid 0; 0 -> new Switch {0000000000200000} portnum 0 lid 0-0 ""
DR path slid 0; dlid 0; 0,1 -> new Channel Adapter {0000000000100000} portnum 1 lid 0-0 ""
DR path slid 0; dlid 0; 0,2 -> new Channel Adapter {0000000000100003} portnum 1 lid 0-0 ""
DR path slid 0; dlid 0; 0,3 -> new Switch {0000000000200001} portnum 0 lid 0-0 ""
DR path slid 0; dlid 0; 0,3,1 -> new Channel Adapter {0000000000100006} portnum 1 lid 0-0 ""
DR path slid 0; dlid 0; 0,3,2 -> new Channel Adapter {0000000000100009} portnum 1 lid 0-0 ""
```

Each `DR path` line is a **directed route**:
a literal sequence of "leave this port number" hops from the tool's own attachment point (`0`).
This is exactly how discovery can work before any LID exists (recall IB02:
LID-based routing is not available yet during discovery).
Read `0,3,1` as: "from my starting switch, go out port 3 (to Switch2), then out port 1 (to Hca3)."

Full output (the same data you saw in IB05, reproduced here for the annotation exercise):

```
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
```

## Field-by-field, precisely

```
vendid=0x0  devid=0x0           -> vendor ID / device ID -- 0 here because ibsim doesn't emulate a
                                   real ASIC vendor (CAPABILITIES.md: no vendor firmware exists)
sysimgguid=0x200001              -> System Image GUID -- identifies "this physical chassis" (relevant
                                   on real multi-ASIC switches with several sysimgguid-sharing switch chips)
switchguid=0x200001(200001)      -> the switch's Node GUID, shown in hex twice (with/without leading zeros)
Switch  8  "S-...200001"         -> node type, number of ports (8), ibsim's synthetic node id
        # "Switch2"              -> the human name YOU gave it in the .net file (NOT part of real IB protocol --
                                   this comment is ibnetdiscover's own convenience annotation)
base port 0 lid 3 lmc 0          -> the switch's own management port is LID 3, LMC 0 (1 LID per port)
[1] "H-...100006"[1](100007)     -> local port 1 connects to a Channel Adapter's port 1, whose PORT GUID is 100007
        # "Hca3" lid 5 4xSDR      -> that neighbor's name, its LID, and the negotiated link width/speed
```

## Exercises — answer using only the output above (no extra commands)

1. Which port on Switch1 connects to Hca2?
   <details><summary>Answer</summary>Port 2 — the line <code>[2] "H-0000000000100003"[1](100004) # "Hca2" ...</code> under Switch1's record.</details>
2. What is Hca3's LID?
   <details><summary>Answer</summary>5 — from Switch2's record, port 1's neighbor annotation <code>\# "Hca3" lid 5 4xSDR</code>.</details>
3. Which physical link is the inter-switch link (ISL), and what port number is it on each side?
   <details><summary>Answer</summary>Switch1 port 3 &lt;-&gt; Switch2 port 3 (both records show <code>[3] "S-...other switch"[3]</code>).</details>
4. If Switch2's record showed `[3] "S-0000000000200000"[5]` instead of `[3]`, what would that mean?
   <details><summary>Answer</summary>The ISL would land on Switch1's port 5, not port 3 -- the two port numbers on either end of a link are independent of each other; nothing requires them to match.</details>

## What happened?

1. `ibnetdiscover` began at whatever node its `LD_PRELOAD`-intercepted UMAD client is "plugged into" (Switch1,
   the first node in the topology file, per ARCHITECTURE.md's SIM_HOST note),
   using directed routes (`-s` output above).
2. Each successful `NodeInfo`/`PortInfo` SMP response added one node/port to its internal graph.
   When a port pointed at a not-yet-visited node,
   that became the next directed route to try (`0,3`, then `0,3,1`,
   and so on): a real breadth-first walk, not a pre-known map.
3. Once the whole reachable graph was built, `ibnetdiscover` formatted it.
   This is the same format `ibsim` accepts as an input `.net` file,
   closing the loop with IB02's note about seeding `ibsim` from a real cluster snapshot.

## Verification checklist

- [ ] `-s` output shows exactly 6 `DR path` lines (1 switch + 2 CAs behind it, twice)
- [ ] You can answer all 4 exercise questions without re-running a command
- [ ] `ibswitches`/`ibhosts` (optional challenge) list matches the switches/CAs in the full dump

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `-s` output is empty | Ran before `ibsim` finished starting | Re-run `discover.sh -s` a second later |
| DR path hop counts look different from this doc | Different starting attachment point (`SIM_HOST`) | Expected if you changed which node is "first" in the topology file |

## Cleanup

```bash
./scripts/stop-sim.sh
```

## Optional challenge

Run `ibswitches` and `ibhosts` (narrower views: switches only, CAs only),
and confirm their combined output matches every node in the full `ibnetdiscover` dump,
with none missing and none extra:

```bash
docker exec ibsim-lab bash -c 'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO ibswitches'
docker exec ibsim-lab bash -c 'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO ibhosts'
```

## Interview questions

*(asked again, consolidated, after IB08)*

1. **Beginner:** Why can discovery work using directed routes before any LID has been assigned?
2. **Intermediate:** What does the `(100007)` in `[1] "H-0000000000100006"[1](100007)` represent,
   and how is it different from the `H-0000000000100006` node identifier right before it?
3. **RDMA specialist:** `ibnetdiscover`'s output format is deliberately compatible with `ibsim`'s input format.
   What real operational workflow does that enable,
   that this module's hand-written `.net` files do not demonstrate?
