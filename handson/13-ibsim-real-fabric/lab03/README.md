# IB03 — GUIDs, LIDs, ports, and GIDs, empirically

## Objective

Use the IB02 fabric (now with OpenSM running) to see GUID, LID, port state,
and GID with real commands.
Understand exactly how a GID is built from a LID's port.

## Concepts learned

- The GUID/LID/GID distinction from [ARCHITECTURE.md §2](../ARCHITECTURE.md#2-addressing-guid-vs-lid-vs-gid),
  now with real values from a real (simulated) fabric.
- Port physical state vs. logical state.
- `smpquery`, `ibstat`, `ibaddr` as three different windows onto the same port.

## Prerequisites

- IB02's `simple.net` topology and the general workflow.

## Topology

Same as IB02: `Hca1 --- Switch1 --- Hca2`.
This time you run OpenSM first, so LIDs get assigned.

## Exact commands

```bash
cd 13-ibsim-real-fabric
./scripts/start-sim.sh simple
./scripts/start-opensm.sh
```

Now inspect the fabric several different ways:

```bash
./scripts/discover.sh -l                                   # GUIDs, node types, one line each
docker exec ibsim-lab bash -c \
  'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO ibstat'
docker exec ibsim-lab bash -c \
  'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO smpquery nodeinfo 2'
docker exec ibsim-lab bash -c \
  'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO smpquery portinfo 2'
docker exec ibsim-lab bash -c \
  'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO ibaddr'
```

(`2` above is Hca1's LID, from the `discover.sh` output in the "Expected output" section below.
OpenSM assigns LID values, and they stay stable for this exact topology file and OpenSM version.
In general, treat them as "look them up, do not hardcode them.")

## Expected output

`./scripts/discover.sh -l` (list form: one line per node, GUID visible directly, no LID clutter):

```
ibwarn: [71] sim_connect: attached as client 1 at node "Switch1"
Ca	 : 0x0000000000100003 ports 2 devid 0x0 vendid 0x0 "Hca2"
Ca	 : 0x0000000000100000 ports 2 devid 0x0 vendid 0x0 "Hca1"
Switch	 : 0x0000000000200000 ports 8 devid 0x0 vendid 0x0 "Switch1"
```

`smpquery nodeinfo 2` (LID 2 = Hca1, per the discover output above once OpenSM assigns LIDs):

```
# Node info: Lid 2
BaseVers:........................1
ClassVers:.......................1
NodeType:........................Channel Adapter
NumPorts:........................2
SystemGuid:......................0x0000000000100000
Guid:............................0x0000000000100000
PortGuid:........................0x0000000000100001
PartCap:.........................64
DevId:...........................0x0000
Revision:........................0x000000a1
LocalPort:.......................1
VendorId:........................0x000000
```

`smpquery portinfo 2` (trimmed to the fields this lab needs; full output has about 50 fields):

```
# Port info: Lid 2 port 0
GidPrefix:.......................0xfe80000000000000
Lid:.............................2
SMLid:...........................1
LinkWidthActive:.................4X
LinkSpeedActive:.................2.5 Gbps
LinkState:.......................Active
PhysLinkState:...................LinkUp
```

`ibaddr` (queries the *default* port: Switch1's own management port here,
since no target was given):

```
GID fe80::20:0 LID start 0x1 end 0x1
```

`ibstat` (again, defaults to whatever local device is presented,
which for a simulated node without a `-C`/CA name is Switch1 itself):

```
Switch 'ibsim0'
	Switch type: simulator
	...
	Node GUID: 0x0000000000200000
	System image GUID: 0x0000000000200000
	Port 0:
		State: Active
		Physical state: LinkUp
		Base lid: 1
		SM lid: 1
		Port GUID: 0x0000000000200000
```

## Reading these together: how a GID is built

Take Hca1's port 1: `Guid: 0x0000000000100000` is the *node* GUID.
`PortGuid: 0x0000000000100001` is the specific *port's* GUID (they usually differ by port number, as here).
`smpquery portinfo`'s `GidPrefix: 0xfe80000000000000` is the subnet prefix.
This is the standard IB **link-local** prefix, `fe80::/64`,
the same numeric convention as IPv6 link-local.
This is not a coincidence: GIDs are deliberately shaped like IPv6 addresses.
Concatenate them:

```
GID = GidPrefix (first 64 bits) : PortGuid (last 64 bits)
    = fe80:0000:0000:0000 : 0000:0000:0010:0001
    = fe80::10:1                      (compressed form)
```

Compare that against `ibaddr`'s compact `fe80::20:0` for Switch1's own port (GUID `0x200000` compresses to `::20:0`).
Same construction, different port.

## GUID vs LID vs GID, with this lab's real values

| | Value seen | Where |
|---|---|---|
| **Node GUID** (Hca1) | `0x0000000000100000` | `ibnetdiscover -l`, `smpquery nodeinfo` |
| **Port GUID** (Hca1 port 1) | `0x0000000000100001` | `smpquery nodeinfo`'s `PortGuid` |
| **LID** (Hca1 port 1) | `2` | assigned by OpenSM; changes if you restart OpenSM or change the topology |
| **GID** (Hca1 port 1) | `fe80::10:1` | derived: `GidPrefix` + `PortGuid`, never independently assigned |

## What happened?

1. `smpquery` is a thin, direct MAD client (part of `infiniband-diags`).
   `nodeinfo`/`portinfo` are the `NodeInfo`/`PortInfo` SMP attributes defined by the InfiniBand spec, fetched by LID.
2. `ibsim` burned in the GUIDs you see when it parsed the topology file,
   deterministically, based on node order.
   On real hardware these come from the vendor at manufacture time, and never change.
3. OpenSM wrote the LIDs you see during the `Entering MASTER state` sweep,
   from IB04's predecessor step (`start-opensm.sh`).
   If you restart OpenSM against the same fabric, the same LIDs generally come back.
   This happens because OpenSM's assignment order is deterministic for an unchanged topology,
   not because LIDs are "sticky" to a GUID by protocol design.
   Contrast this with GUIDs, which truly cannot change.
4. `ibaddr`'s GID is not stored anywhere as its own value.
   It is computed at query time, from the port's GID prefix (usually the default link-local one,
   unless an SM assigns a custom subnet prefix) plus the port GUID.

## Verification checklist

- [ ] `discover.sh -l` shows 1 switch + 2 CAs with distinct GUIDs
- [ ] `smpquery nodeinfo <lid>` and `smpquery portinfo <lid>` both succeed for Hca1's LID
- [ ] You can manually reconstruct Hca1's GID from `GidPrefix` + `PortGuid` and it matches the compact form `ibaddr`-style output would show

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `smpquery nodeinfo 2` returns nothing / times out | OpenSM has not finished assigning LIDs yet, or LID 2 does not exist in your topology | `tail -f` `/lab/opensm.log` for "Entering MASTER state" first. Re-run `discover.sh` to see which LIDs exist |
| `ibstat`/`ibaddr` show the switch, not the HCA you expected | Neither tool was told which CA to query | Real hardware: pass `-C <ca_name>` `-P <port>`. Under `ibsim`, the "local" device is always whatever node the umad2sim client attaches as. By default this is the first node in the topology file (Switch1 here) |

## Cleanup

```bash
./scripts/stop-sim.sh
```

## Optional challenge

Compute, by hand, what Hca2's GID should be (its Node/Port GUIDs are in the IB02 `ibnetdiscover` output).
Confirm it with `smpquery portinfo <Hca2's LID>` and `ibaddr`-style reconstruction.

## Interview questions

1. **Beginner:** Which of GUID, LID, GID can change without any hardware being replaced?
2. **Intermediate:** Why is a GID's subnet prefix `fe80::/64` by default,
   and what would change it in a real multi-subnet deployment?
3. **Senior SRE:** An application caches a peer's LID and reconnects by LID after OpenSM restarts.
   What could break, and why would caching the GID instead be safer for anything that crosses an SM restart (even though it is still IB,
   not routed to another subnet)?
4. **RDMA specialist:** `NodeInfo`'s `PortGuid` field is documented as "the GUID of the port this SMP arrived on."
   This differs for switches (one `PortGuid`,
   which is a switch management port) versus multi-port HCAs.
   What does that imply about identifying *which* HCA port you are talking to when a multi-port HCA is involved?
