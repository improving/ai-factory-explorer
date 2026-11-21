# IB13 — Partitions and P_Key

## Objective

Configure a real OpenSM partition and confirm it is programmed into the simulated fabric's P_Key tables.
Then understand what that does and does not prove, per [CAPABILITIES.md](../CAPABILITIES.md).

## Concepts learned

- P_Key format: a 16-bit value where the top bit (0x8000) means **full membership**,
  and its absence means **limited membership**.
- `partitions.conf` syntax (OpenSM's partition manager configuration).
- Why partition configuration is fully demonstrable here,
  but partition enforcement is not: no data plane exists to enforce anything against.

## Prerequisites

- IB04 (OpenSM basics), IB03 (`smpquery`).

## Topology

`topologies/two-switch.net`.

## Exact commands

```bash
cd 13-ibsim-real-fabric
./scripts/start-sim.sh two-switch

# Write a partitions.conf INSIDE the container (OpenSM reads /etc/opensm/partitions.conf by default)
docker exec ibsim-lab mkdir -p /etc/opensm
docker exec ibsim-lab bash -c 'cat > /etc/opensm/partitions.conf << "EOF"
Default=0x7fff, ipoib, sl=0, defmember=full : ALL, ALL_SWITCHES=full;
Lab13=0x0015, sl=0, defmember=limited : ALL_CAS;
EOF'

./scripts/start-opensm.sh
sleep 1

# Read Hca1's actual, programmed P_Key table back
docker exec ibsim-lab bash -c \
  'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO smpquery pkeytable 2'
```

## Expected output

```
   0: 0xffff 0x0015 0x0000 0x0000 0x0000 0x0000 0x0000 0x0000
   8: 0x0000 0x0000 0x0000 0x0000 0x0000 0x0000 0x0000 0x0000
  16: 0x0000 0x0000 0x0000 0x0000 0x0000 0x0000 0x0000 0x0000
  ...
64 pkeys capacity for this port
```

Reading the two populated entries:

```
0xffff  -> P_Key 0x7fff (Default partition), FULL membership (top bit 0x8000 set: 0x8000|0x7fff = 0xffff)
0x0015  -> P_Key 0x0015 (our "Lab13" partition), LIMITED membership (top bit clear: 0x0015 has no 0x8000 bit)
```

This is not a fabricated demo value.
It is the real OpenSM partition manager reading your real `partitions.conf`,
computing each partition's membership bit per port, and pushing it with a real `Set(PKeyTable)` MAD.
`ibsim`'s simulated Hca1 port stored it and returned it when queried.

## What is demonstrated here vs. what is not

Per the feature table in [CAPABILITIES.md](../CAPABILITIES.md):

| | Demonstrated in this lab? |
|---|---|
| Writing a `partitions.conf` and having OpenSM parse it | **Yes** |
| OpenSM computing per-port P_Key table entries and full/limited membership bits | **Yes** (real OpenSM code, run unmodified) |
| Reading those entries back with `smpquery pkeytable` | **Yes** |
| A send from a port with only limited membership in P_Key 0x0015 being **rejected** by
  switch hardware, when it tries to reach a port outside that partition | **No.** This requires a real data-plane send through a real switch ASIC's P_Key enforcement logic,
  which `ibsim` does not have.
  This module can show you the configuration is correct; it cannot show you the enforcement working. |

If you need to prove enforcement, not only configuration,
that is a real-hardware exercise: configure two hosts into different,
non-overlapping limited partitions, and attempt an RC connection between them.
A correctly configured switch should refuse it.
This module cannot get you further than confirming the table is programmed correctly.

## What happened?

1. OpenSM's partition manager (`osm_prtn_make_partitions`,
   seen failing gracefully with "not accessible" in IB04's log when no file existed) parsed `/etc/opensm/partitions.conf` during its `MASTER`-state sweep.
2. For each partition line, it resolved the port list (`ALL`, `ALL_CAS`,
   `ALL_SWITCHES`, or explicit node names) against the discovered fabric.
   For each matching port, it computed a P_Key table entry with the membership bit from `defmember=full`/`limited`.
3. It issued a `Set(PKeyTable)` SMP to every affected port, including Hca1's port.
4. `smpquery pkeytable 2` sent a `Get(PKeyTable)` SMP to that same port and printed back what was stored.
   No computation happens on the client side.

## Verification checklist

- [ ] `smpquery pkeytable 2` shows `0xffff` in block 0 slot 0 (Default, full)
- [ ] The same output shows `0x0015` in block 0 slot 1 (Lab13, limited)
- [ ] You can explain, without looking it up again, why `0xffff` means full and `0x0015` means limited

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| P_Key table only shows `0xffff` (no `0x0015`) | `partitions.conf` was not in place before OpenSM started, or it has a syntax error | Check `docker exec ibsim-lab grep -i prtn /lab/opensm.log` for a parse warning; re-check that the file was written before `start-opensm.sh` |
| `smpquery pkeytable` returns all zeros | Wrong LID, or OpenSM has not reached `MASTER` state or finished its sweep yet | Re-check the LID from `discover.sh`; wait for `SUBNET UP` in the log |

## Cleanup

```bash
./scripts/stop-sim.sh
```

(the `partitions.conf` you wrote lives only inside the removed container;
no host-side cleanup is needed)

## Optional challenge

Add a third partition scoping only Hca1 and Hca3 (across both switches) with `defmember=full`.
Restart OpenSM.
Confirm both hosts show that P_Key with the full-membership bit set,
while Hca2/Hca4 do not show it at all.

## Interview questions

*(consolidated, after IB16)*

1. **Beginner:** What does the top bit of a P_Key value mean?
2. **Intermediate:** Why can this module prove partition configuration correctness but not enforcement?
3. **Senior SRE:** A real-fabric ticket says that two hosts that should be isolated by partition can still ping each other.
   Given this lab's distinction, where would you look first,
   OpenSM's configuration or the switch's data-plane behavior?
   Why?
