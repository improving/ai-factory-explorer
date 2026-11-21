# IB08 — `ibroute`

## Objective

Read a switch's real linear forwarding table (LFT).
Predict one entry before you look at it.
Then find and understand a limit in `ibroute`'s node-name resolution.

## Concepts learned

- The LFT gives one rule: for destination LID X, send the packet out local port Y.
  It does no rewriting and adds no headers.
- `ibroute`'s addressing options: by LID, or by GUID.
  Addressing by a human-readable node name does not work by default.

## Prerequisites

- IB05, IB07 (`two-switch.net`).

## Topology

[`topologies/two-switch.net`](../topologies/two-switch.net) — same as IB05 and IB07.

## Exact commands

```bash
cd 13-ibsim-real-fabric
./scripts/start-sim.sh two-switch
./scripts/start-opensm.sh
```

**Predict first:** for Switch1, decide which output port LID 6 (Hca4, behind Switch2) uses.
Write your answer down.
Then check it with `./scripts/routes.sh 1`.

```bash
./scripts/routes.sh 1              # by LID -- works
```

Now try addressing by the node's name, the way you might type it at first:

```bash
docker exec ibsim-lab bash -c \
  'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO ibroute Switch1'
```

## Expected output

`./scripts/routes.sh 1` (Switch1's LFT):

```
ibwarn: [82] sim_connect: attached as client 1 at node "Switch1"
Unicast lids [0x0-0x6] of switch Lid 1 guid 0x0000000000200000 (Switch1):
  Lid  Out   Destination
       Port     Info 
0x0001 000 : (Switch portguid 0x0000000000200000: 'Switch1')
0x0002 001 : (Channel Adapter portguid 0x0000000000100001: 'Hca1')
0x0003 003 : (Switch portguid 0x0000000000200001: 'Switch2')
0x0004 002 : (Channel Adapter portguid 0x0000000000100004: 'Hca2')
0x0005 003 : (Channel Adapter portguid 0x0000000000100007: 'Hca3')
0x0006 003 : (Channel Adapter portguid 0x000000000010000a: 'Hca4')
6 valid lids dumped 
```

**If you predicted port 3 for LID 6 (Hca4), you are correct.**
Hca4 is behind Switch2.
Switch1's only path to Switch2 is port 3, the ISL.
Every LID behind Switch2 (0x0003 through 0x0006) routes out the same port 3 for this reason:
a switch's LFT states only which of its own ports gets the packet closer,
not the whole remaining path.

`ibroute Switch1` (addressing by name):

```
ibwarn: [71] sim_connect: attached as client 1 at node "Switch1"
ibroute: iberror: failed: can't resolve destination port Switch1
```

**This fails.**
`ibroute` (like most `infiniband-diags` tools) resolves its target argument as a LID,
a GUID (with `-G`), or a `Ca/Switch` name from a node-name-map file (`--node-name-map`).
It does not resolve the free-text name you gave the node inside your `.net` topology file.
Those are two different naming systems.
The `.net` file's `"Switch1"` string is meaningful only to `ibsim`.
`infiniband-diags`' node name maps are a separate,
optional GUID-to-friendly-name mapping file you would generate yourself (`ibnetdiscover` can help build one) if you wanted this to work by name.

Addressing by GUID instead works fine:

```bash
docker exec ibsim-lab bash -c \
  'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO ibroute -G 0x200000'
```
```
Unicast lids [0x0-0x6] of switch Lid 1 guid 0x0000000000200000 (Switch1):
  ... (identical table to the by-LID query above)
```

## Field-by-field

```
Unicast lids [0x0-0x6] of switch Lid 1 ...   -> this switch has 6 populated LFT entries (0 unused here)
  Lid  Out Port  Info
0x0001 000 : (Switch ... 'Switch1')            -> lid 1 is THIS switch itself -- port 000 means "local," not a real egress
0x0002 001 : (Channel Adapter ... 'Hca1')      -> lid 2 (Hca1) is directly attached to my port 1
0x0003 003 : (Switch ... 'Switch2')            -> lid 3 (Switch2 itself) is reached via my port 3 (the ISL)
0x0004 002 : (Channel Adapter ... 'Hca2')      -> lid 4 (Hca2) is directly attached to my port 2
0x0005 003 : (Channel Adapter ... 'Hca3')      -> lid 5 (Hca3, BEHIND Switch2) still routes out my port 3
0x0006 003 : (Channel Adapter ... 'Hca4')      -> same: any LID behind Switch2 goes out port 3
```

## What happened?

1. OpenSM's routing engine, during the `MASTER` sweep (IB04),
   computed for every switch the minimum-hop-count next port toward every other LID in the subnet.
   It issued a `SET(LinearForwardingTable)` MAD per switch to install the result.
2. `ibroute` sent a `GetTable(LinearForwardingTable)` SMP to the target switch (resolved to Switch1 by LID or GUID) and printed the raw table back.
   It does not compute anything itself; it only reads.
3. The `ibroute Switch1` failure happened entirely on the client side, before the tool sent any MAD.
   `ibroute` could not turn the string `"Switch1"` into a LID or GUID, so it stopped.

## Verification checklist

- [ ] Your prediction for LID 6's output port matches the real table
- [ ] `ibroute Switch1` fails with `can't resolve destination port`
- [ ] `ibroute -G 0x200000` and `ibroute 1` (by LID) return identical tables

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ibroute <name>` fails | Expected; see above | Use `-G <guid>` or the numeric LID instead, or supply `--node-name-map` |
| Table shows fewer than 6 lids | OpenSM has not finished the sweep, or a link is down | Check `discover.sh` first for how many LIDs exist |

## Cleanup

```bash
./scripts/stop-sim.sh
```

## Optional challenge

Run `./scripts/routes.sh 3` (Switch2's table).
Confirm that every LID on Switch1's side (Hca1, Hca2,
and Switch1 itself) routes out Switch2's port 3, the same ISL, mirrored.
Then explain, in one sentence, why a switch's LFT never needs more than one entry per remote LID,
no matter how many hops away it is.

## Interview questions

1. **Beginner:** What does port `000` mean in an `ibroute` table entry for the querying switch's own LID?
2. **Intermediate:** Why do LIDs 0x0003-0x0006 in Switch1's table all point to the same output port?
3. **Senior SRE:** You are told that traffic to host X is slow.
   `ibroute` on the nearest switch shows a valid, single-hop-looking entry for X's LID.
   What does `ibroute` alone not tell you that you would need `ibtracert` (IB09) for?
4. **RDMA specialist:** Why does `infiniband-diags` require a separate node-name-map file,
   instead of reading node names directly from the fabric,
   given that `NodeDescription` (a real SMP attribute) already carries a human-readable string?
