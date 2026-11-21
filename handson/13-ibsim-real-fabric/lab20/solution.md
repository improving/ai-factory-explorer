# IB20 — Solution

This is the solution to the [lab 20 capstone](README.md).
Work the lab from its symptoms first, then open each part to check your diagnosis.

<details>
<summary>What was broken (three independent problems)</summary>

1. **A redundant link was removed:** `Unlink "Switch1"[3]` —
   the Switch1↔Switch3 leg of the diamond topology (`topologies/capstone.net`) was taken down,
   leaving only the Switch1→Switch2→Switch4 path.
2. **A management-plane fault was injected on the sole remaining path:** `Error "Switch4"[1] 60 21` —
   a 60% failure rate on `PortInfo` queries to Switch4's port facing Switch2,
   the only path left once problem #1 happens.
   This is what produces the "intermittent" symptom, and per IB11's rate caveat,
   can sometimes present as much worse than 60% (this module observed full timeouts to everything behind Switch4 in some runs).
   That variability is itself realistic.
3. **Partition configuration drift:** `/etc/opensm/partitions.conf` gave Hca4 (port GUID `0x000000000010000a`) an extra `limited`-membership partition (`0x0020`) that no other host has.
   Hca4 is still a full member of `Default` (`0x7fff`),
   because `Default` includes `ALL` hosts, so this entry does not isolate Hca4.
   It is a stray partition that only one host has, a real,
   verified P_Key difference between Hca4 and everyone else (IB13's mechanism),
   and the kind of drift a health check must find.

</details>

<details>
<summary>Step-by-step diagnosis (as verified in this module)</summary>

**Step 1-2: discover and note what is missing or inconsistent.**

```
$ ./scripts/discover.sh -l
./libibnetdisc/query_smp.c:186; umad (DR path slid 0; dlid 0; 0,2,2 Attr 0x15:3) bad status 110; Connection timed out
./libibnetdisc/query_smp.c:186; umad (DR path slid 0; dlid 0; 0,2,2 Attr 0x15:5) bad status 110; Connection timed out
./libibnetdisc/query_smp.c:186; umad (DR path slid 0; dlid 0; 0,2,2 Attr 0x15:8) bad status 110; Connection timed out
Ca	 : 0x0000000000100009 ports 2 devid 0x0 vendid 0x0 "Hca4"
Ca	 : 0x0000000000100003 ports 2 devid 0x0 vendid 0x0 "Hca3"
Ca	 : 0x0000000000100000 ports 2 devid 0x0 vendid 0x0 "Hca1"
Switch	 : 0x0000000000200002 ports 8 devid 0x0 vendid 0x0 "Switch3"
Switch	 : 0x0000000000200003 ports 8 devid 0x0 vendid 0x0 "Switch4"
Switch	 : 0x0000000000200001 ports 8 devid 0x0 vendid 0x0 "Switch2"
Switch	 : 0x0000000000200000 ports 8 devid 0x0 vendid 0x0 "Switch1"
```

Note the `Connection timed out` errors, and that `Hca2` is missing from this particular run.
But, crucially, **running the same command again a few times shows different,
inconsistent results** (sometimes Hca2 appears, sometimes it does not).
This inconsistency is itself the first real clue: something is producing **timeouts,
not a clean failure**, on the path toward Switch4's HCAs.

**Step 3: inspect port states with `iblinkinfo`.**

```
Switch: 0x0000000000200002 Switch3:
           4    1[  ] ==(                Down/ Polling)==>             [  ] "" ( )
           4    2[  ] ==( 4X           2.5 Gbps Active/  LinkUp)==>       5    2[  ] "Switch4" (Could be 12X Could be 10.0 Gbps)
```

Switch3's port 1 is `Down/Polling` with nothing attached: **problem #1 confirmed.**
This is the missing Switch1↔Switch3 link.
Switch3 is not fully cut off, because its port 2 to Switch4 is still `Active`,
but it has lost its direct path to Switch1.

**Step 4-5: LIDs and forwarding tables.**

```
$ ./scripts/routes.sh 1
Unicast lids [0x0-0x8] of switch Lid 1 guid 0x0000000000200000 (Switch1):
  Lid  Out   Destination
       Port     Info 
0x0001 000 : (Switch portguid 0x0000000000200000: 'Switch1')
0x0002 001 : (Channel Adapter portguid 0x0000000000100001: 'Hca1')
0x0003 002 : (Switch portguid 0x0000000000200001: 'Switch2')
0x0004 002 : (Switch portguid 0x0000000000200002: 'Switch3')
0x0005 002 : (Switch portguid 0x0000000000200003: 'Switch4')
0x0006 004 : (Channel Adapter portguid 0x0000000000100004: 'Hca3')
0x0007 002 : (Channel Adapter portguid 0x0000000000100007: 'Hca2')
0x0008 002 : (Channel Adapter portguid 0x000000000010000a: 'Hca4')
8 valid lids dumped 
```

**This is the "suspicious forwarding table" clue:** 5 of Switch1's 8 destinations (Switch2,
Switch3, Switch4, Hca2, Hca4) all funnel through the single port 002,
because port 003 (the old Switch3 leg) is gone,
everything that used to have two options now has exactly one.
This table is not wrong, but it is a visible symptom of lost redundancy,
exactly what you would want to notice in a real health review, before it becomes an outage.

**Step 6-7: trace and confirm the intermittent fault's location.**

```
$ ./scripts/trace.sh 2 7    # Hca1 -> Hca2
```

Run this several times.
Sometimes it succeeds; sometimes it fails partway with a MAD timeout.
The inconsistency itself locates the fault to whatever single link every one of these paths must now cross:
Switch1→Switch2→Switch4.
Checking `iblinkinfo`'s port-level detail, or noting that **every** path to Switch4's HCAs (Hca2,
Hca4) shares that one link, while Hca1/Hca3 (both on Switch1 directly) are never affected,
narrows the fault to the Switch2↔Switch4 leg specifically,
matching problem #2's actual injection point.

**The partition problem (problem #3) does not show up in any of the above;
it requires checking P_Keys directly:**

```
$ docker exec ibsim-lab bash -c 'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO smpquery pkeytable 2' | head -1
   0: 0xffff 0x0000 0x0000 0x0000 0x0000 0x0000 0x0000 0x0000

$ docker exec ibsim-lab bash -c 'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO smpquery pkeytable 8' | head -1
   0: 0xffff 0x0020 0x0000 0x0000 0x0000 0x0000 0x0000 0x0000
```

Hca4 (lid 8) has a **second** P_Key entry (`0x0020`,
limited membership) that Hca1 (lid 2) does not have.
The first entry, `0xffff`, is the same on both hosts: Hca4 is still a full member of `Default`.
So this entry does not isolate Hca4,
and it does not cause the "one host can reach some HCAs but not others" symptom —
problem #2 does (steps 6-7).
It is configuration drift: a partition that only one host has and that nobody intended.
(Per IB13's caveat: this proves the *misconfiguration*,
not that a real switch ASIC would enforce it — `ibsim` cannot demonstrate enforcement.)

</details>

<details>
<summary>Restoring the fabric</summary>

```bash
# Fix #1: restore the redundant link
docker exec ibsim-lab tmux send-keys -t ibsim 'ReLink "Switch1"[3]' Enter

# Fix #2: clear the injected error rate
docker exec ibsim-lab tmux send-keys -t ibsim 'Error "Switch4"[1] 0 21' Enter

# Fix #3: correct the partition config and restart OpenSM to re-read it
docker exec ibsim-lab bash -c 'cat > /etc/opensm/partitions.conf << "EOF"
Default=0x7fff, ipoib, sl=0, defmember=full : ALL, ALL_SWITCHES=full;
EOF'
./scripts/start-opensm.sh
```

</details>

<details>
<summary>Verifying recovery</summary>

```bash
./scripts/discover.sh -l                 # all 8 nodes, consistently, run after run
./scripts/routes.sh 1                    # traffic spread back across both port 002 AND 003
docker exec ibsim-lab bash -c 'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO smpquery pkeytable 8' | head -1
   0: 0xffff 0x0000 0x0000 0x0000 0x0000 0x0000 0x0000 0x0000   # matches Hca1 now -- partition fixed
```

</details>
