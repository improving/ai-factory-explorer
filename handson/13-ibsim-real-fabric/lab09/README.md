# IB09 — `ibtracert`

## Objective

Trace the actual end-to-end path between two HCAs and confirm it matches what the individual switches' forwarding tables (IB08) predict, hop by hop.

## Concepts learned

- `ibtracert`'s output format and how it differs from `ibroute` (single path vs. whole table).
- Confirming a trace against forwarding tables independently,
  the way you would double-check a suspected routing problem on a real fabric.

## Prerequisites

- IB06 (`multipath.net`), IB08 (`ibroute`).

## Topology

[`topologies/multipath.net`](../topologies/multipath.net) — same diamond as IB06.

## Exact commands

```bash
cd 13-ibsim-real-fabric
./scripts/start-sim.sh multipath
./scripts/start-opensm.sh
./scripts/discover.sh -l                # confirm node list
./scripts/trace.sh 2 6                  # Hca1 (lid 2) -> Hca2 (lid 6)
```

## Expected output

```
ibwarn: [71] sim_connect: attached as client 1 at node "Switch1"
From ca {0x0000000000100000} portnum 1 lid 2-2 "Hca1"
[1] -> switch port {0x0000000000200000}[1] lid 1-1 "Switch1"
[2] -> switch port {0x0000000000200001}[1] lid 3-3 "Switch2"
[2] -> switch port {0x0000000000200003}[1] lid 5-5 "Switch4"
[3] -> ca port {0x0000000000100004}[1] lid 6-6 "Hca2"
To ca {0x0000000000100003} portnum 1 lid 6-6 "Hca2"
```

Field-by-field:

```
From ca {...100000} portnum 1 lid 2-2 "Hca1"     -> the trace's source: Hca1, its own port, its LID
[1] -> switch port {...200000}[1] lid 1-1 "Switch1"   -> left Hca1 via its port 1, arrived Switch1 port 1
[2] -> switch port {...200001}[1] lid 3-3 "Switch2"    -> left Switch1 via port 2, arrived Switch2 port 1
[2] -> switch port {...200003}[1] lid 5-5 "Switch4"    -> left Switch2 via port 2, arrived Switch4 port 1
[3] -> ca port {...100004}[1] lid 6-6 "Hca2"            -> left Switch4 via port 3, arrived Hca2 port 1
To ca {...100003} portnum 1 lid 6-6 "Hca2"       -> the trace's destination, confirmed reached
```

This is the exact path: `Hca1 → Switch1 → Switch2 → Switch4 → Hca2`,
the same one IB06 found by reading `ibroute`'s table on Switch1 alone.
`ibtracert` did the same multi-hop version of that lookup for you,
hop by hop, and queried each switch along the way.

## Comparing against the forwarding tables (from IB06)

| Hop | Switch | LFT says (for lid 6) | Matches trace? |
|---|---|---|---|
| 1 | Switch1 (lid 1) | out port 2 (Switch2) | Yes; the trace left Switch1 via port 2 |
| 2 | Switch2 (lid 3) | out port 2 (Switch4) | Yes; the trace left Switch2 via port 2 |
| 3 | Switch4 (lid 5) | out port 3 (Hca2) | Yes; the trace left Switch4 via port 3 |

`ibtracert` did not need this information in advance.
It queried each switch's `LinearForwardingTable` directly,
followed whichever port each one named, and continued until it reached the destination LID.
It is, in effect, an automated version of the by-hand table reading you did in IB08.

## What happened?

1. `ibtracert` resolved the source (lid 2) and the destination (lid 6), then started a directed walk.
   It queried the source's directly-attached switch for lid 6's LFT entry,
   followed that port, and repeated the query from the switch on the other end.
2. Each `[N] -> ... lid X-X "name"` line in the output is one hop.
   It is a real `GetTable` (or `Get(PortInfo)`,
   depending on hop type) SMP round trip against the currently installed forwarding state,
   not a precomputed or cached path.
3. Reaching the destination CA's own port ends the trace successfully.

## Verification checklist

- [ ] `trace.sh 2 6` shows 4 hops (Hca1→Switch1→Switch2→Switch4→Hca2)
- [ ] Every intermediate hop's "leave via port N" matches that switch's `ibroute` table for lid 6

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ibtracert` reports "no route to destination" partway through | A link along the path is down, or the LFT has a stale/invalid entry for that LID | Cross-check with `ibroute` on the switch where the trace stopped; this is the IB12 troubleshooting flow |
| Trace takes a different path than `ibroute` predicted | You captured `ibroute`/`ibtracert` output from different OpenSM runs (LIDs or routes changed in between) | Re-run both back-to-back in the same session |

## Cleanup

```bash
./scripts/stop-sim.sh
```

## Optional challenge

Trace the reverse direction with `./scripts/trace.sh 6 2`.
Decide whether the path is identical (only reversed) or could differ.
Hint: each switch's LFT is computed independently for each destination LID.
Switch4's entry for lid 2 does not have to be the mirror image of Switch1's entry for lid 6,
though MinHop typically produces symmetric paths for a symmetric topology like this one.

## Interview questions

*(asked again, consolidated after IB12)*

1. **Beginner:** What is the practical difference between running `ibroute` on every switch by hand and running `ibtracert` once?
2. **Intermediate:** If `ibtracert` and `ibroute`, checked independently hop by hop,
   ever disagree about which port a switch uses for a given LID, what would that mean?
3. **Senior SRE:** A path trace succeeds but is one hop longer than you expected from the physical topology diagram.
   What are the two most likely explanations?
   Which commands would you use to tell them apart?
