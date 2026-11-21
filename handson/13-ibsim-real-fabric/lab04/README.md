# IB04 — Introduce OpenSM

## Objective

Run OpenSM against the simulated fabric deliberately (not only through the `start-opensm.sh` helper).
Inspect its log at increasing verbosity, and understand the SM state machine you are watching.

## Concepts learned

- OpenSM's practical CLI (`-f`, `-B`, `-v`/`-V`, `-g`).
- The SM state machine: `DISCOVERING` → `MASTER` (and where `STANDBY`/`SLAVE` would fit with more than one SM;
  not simulated in this lab, see IB12).
- How to read an OpenSM log for "did it finish."

## Prerequisites

- IB02/IB03's workflow (`start-sim.sh`).

## Topology

`topologies/simple.net` again — small enough to read the whole OpenSM log without noise.

## Exact commands

Start the fabric, then run OpenSM **in the foreground**, logging to stdout, at increased verbosity.
This is the "debug mode" version of what `scripts/start-opensm.sh` does quietly in the background:

```bash
cd 13-ibsim-real-fabric
./scripts/start-sim.sh simple

docker exec ibsim-lab bash -c '
  SO=$(find /usr/lib -iname "libumad2sim*.so" | head -1)
  LD_PRELOAD="$SO" timeout 5 opensm -f stdout -v
'
```

`-f stdout` sends the log to your terminal instead of a file.
`-v` increases verbosity once (stack `-v -v`, or use `-V` for maximum).
`timeout 5` stops the daemon after 5 seconds,
because this invocation runs in the foreground and would otherwise block your shell forever.
(Real deployments run OpenSM as a service;
`scripts/start-opensm.sh` backgrounds it with `-B` for the rest of this module.)

## Expected output

*Example output, captured live from this exact command.
Exact GUIDs, timestamps, and thread IDs will differ run to run.
The state-machine lines, sweep phases, and their order will not change.*

```
-------------------------------------------------
OpenSM 3.3.23
Command Line Arguments:
 Verbose option -v (log flags = 0x7)
 Log File: stdout
-------------------------------------------------
Sep 25 05:23:33 064195 [A98CDCE0] 0x07 -> OpenSM 3.3.23
ibwarn: [34] sim_connect: attached as client 0 at node "Switch1"
Using default GUID 0x200000
Sep 25 05:23:33 069528 [A98CDCE0] 0x80 -> Entering DISCOVERING state
Sep 25 05:23:33 069531 [A98CDCE0] 0x04 -> osm_report_sm_state:
****************** ENTERING SM DISCOVERING STATE ******************

Sep 25 05:23:33 069610 [A98CDCE0] 0x04 -> dump_routing_engine:     name: none - Type: 0
Sep 25 05:23:33 069617 [A98CDCE0] 0x04 -> dump_routing_engine:     name: minhop - Type: 1
Sep 25 05:23:33 069617 [A98CDCE0] 0x04 -> dump_routing_engine:     name: updn - Type: 2
Sep 25 05:23:33 069618 [A98CDCE0] 0x04 -> dump_routing_engine:     name: dnup - Type: 3
Sep 25 05:23:33 069618 [A98CDCE0] 0x04 -> dump_routing_engine:     name: file - Type: 4
Sep 25 05:23:33 069619 [A98CDCE0] 0x04 -> dump_routing_engine:     name: ftree - Type: 5
Sep 25 05:23:33 069619 [A98CDCE0] 0x04 -> dump_routing_engine:     name: lash - Type: 6
Sep 25 05:23:33 069620 [A98CDCE0] 0x04 -> dump_routing_engine:     name: dor - Type: 7
Sep 25 05:23:33 069620 [A98CDCE0] 0x04 -> dump_routing_engine:     name: torus-2QoS - Type: 8
Sep 25 05:23:33 069621 [A98CDCE0] 0x04 -> dump_routing_engine:     name: nue - Type: 9
Sep 25 05:23:33 069621 [A98CDCE0] 0x04 -> dump_routing_engine:     name: dfsssp - Type: 11
Sep 25 05:23:33 069622 [A98CDCE0] 0x04 -> dump_routing_engine:     name: sssp - Type: 10
Sep 25 05:23:33 069623 [A98CDCE0] 0x04 -> setup_routing_engine: setup of routing engine 'minhop' ...
Sep 25 05:23:33 070753 [A245F1A0] 0x04 -> state_mgr_sweep_hop_0:
********************* INITIATING HEAVY SWEEP *********************

Sep 25 05:23:33 071015 [A8D2F1A0] 0x04 -> ni_rcv_process_new: Discovered new Switch node, GUID 0x200000
Sep 25 05:23:33 071184 [A851F1A0] 0x04 -> nd_rcv_process_nd: Node 0x200000, Description = Switch1
Sep 25 05:23:33 072247 [A7D0F1A0] 0x04 -> ni_rcv_process_new: Discovered new Channel Adapter node, GUID 0x100000
Sep 25 05:23:33 072381 [A4CAF1A0] 0x04 -> nd_rcv_process_nd: Node 0x100000, Description = Hca1
Sep 25 05:23:33 072277 [A449F1A0] 0x04 -> ni_rcv_process_new: Discovered new Channel Adapter node, GUID 0x100003
Sep 25 05:23:33 072418 [A6CEF1A0] 0x04 -> nd_rcv_process_nd: Node 0x100003, Description = Hca2
Sep 25 05:23:33 072752 [A245F1A0] 0x04 -> do_sweep:
********************** HEAVY SWEEP COMPLETE **********************

Sep 25 05:23:33 072787 [A245F1A0] 0x80 -> Entering MASTER state
Sep 25 05:23:33 073205 [A245F1A0] 0x04 -> lid_mgr_process_our_sm_node: Assigning SM's port 0x0000000000200000 to LID range [1,1]
Sep 25 05:23:33 073331 [A245F1A0] 0x04 -> osm_lid_mgr_process_subnet: Assigned port 0x0000000000100001, new LID [2,2]
Sep 25 05:23:33 073337 [A245F1A0] 0x04 -> osm_lid_mgr_process_subnet: Assigned port 0x0000000000100004, new LID [3,3]
Sep 25 05:23:33 074093 [A245F1A0] 0x04 -> ucast_mgr_route: building routing with 'minhop' routing algorithm...
Sep 25 05:23:33 074108 [A245F1A0] 0x02 -> osm_ucast_mgr_process: minhop tables configured on all switches
Sep 25 05:23:33 073020 [A245F1A0] 0x04 -> osm_prtn_make_partitions: Partition configuration /etc/opensm/partitions.conf is not accessible (No such file or directory)

=======================================================================================================
Vendor      : Ty : #  : Sta : LID  : LMC : MTU  : LWA : LSA  : Port GUID        : Neighbor Port (Port #)
Unknown     : CA : 01 : ACT : 0002 :  0  : 2048 : 4x  : 2.5  : 0000000000100001 : 0000000000200000 (01)
------------------------------------------------------------------------------------------------------
Unknown     : SW : 00 :     : 0001 :  0  :      :     :      * 0000000000200000 *
Unknown     : SW : 01 : ACT :      :     : 2048 : 4x  : 2.5  * 0000000000200000 * 0000000000100001 (01)
Unknown     : SW : 02 : ACT :      :     : 2048 : 4x  : 2.5  * 0000000000200000 * 0000000000100004 (01)
------------------------------------------------------------------------------------------------------
Unknown     : CA : 01 : ACT : 0003 :  0  : 2048 : 4x  : 2.5  : 0000000000100004 : 0000000000200000 (02)
------------------------------------------------------------------------------------------------------
Sep 25 05:23:33 074896 [A245F1A0] 0x02 -> SUBNET UP
OpenSM: Got signal 15 - exiting...
```

Field annotations:

```
Using default GUID 0x200000     -> no -g given, so OpenSM bound to the first port it found (Switch1)
dump_routing_engine: ...          -> the FULL list of routing engines this OpenSM build supports --
                                      minhop (the default), updn, dnup, file, ftree, lash, dor,
                                      torus-2QoS, nue, dfsssp, sssp. IB14 changes this via -R.
Entering DISCOVERING state         -> starting the SMP walk described in ARCHITECTURE.md §3 step 1
HEAVY SWEEP                        -> OpenSM's term for a full topology re-discovery from scratch
Entering MASTER state              -> no other SM found (or none configured to outrank it) -- see below
lid_mgr_process...LID range [1,1]  -> the SM assigns itself LID 1 first
osm_lid_mgr_process_subnet: ...     -> then assigns every other discovered port a LID, in discovery order
ucast_mgr_route: ... 'minhop' ...   -> the default routing engine actually computing forwarding tables
osm_prtn_make_partitions: ... not accessible -> no partitions.conf shipped in this image; expected, see IB13
the final ASCII table              -> OpenSM's own per-port summary: LID, link width/speed active, state
SUBNET UP                           -> LIDs assigned, routes computed, ports activated -- the fabric is live
"Got signal 15"                     -> `timeout 5` sent SIGTERM to end this foreground demo; OpenSM exited cleanly
```

## The SM state machine, practically

InfiniBand's SM state machine (per the spec) is:
`NOTACTIVE → DISCOVERING → STANDBY → MASTER`, with a possible `SLAVE` state.
For a running SM, the states you practically see are:

- **DISCOVERING:** walks the fabric; has not yet decided whether it should be master.
- **STANDBY:** a *non-master* SM sees another,
  higher-priority (or lower-GUID-tiebreak) SM already active, and defers to it.
  **Not reachable in this lab**: every topology this module uses has only one SM.
  IB12 discusses this scenario conceptually (dual-SM elections),
  because the `ibsim` topologies here do not model a second SM instance.
- **MASTER:** this SM won the election (or found no competitor),
  and actively manages the subnet: it assigns LIDs, computes routes,
  and re-sweeps for changes periodically.

Because every lab here runs exactly one OpenSM instance,
you will only ever see `DISCOVERING → MASTER`.
This is not a limitation worth working around:
a single-SM subnet is also the most common real-world case.
Multi-SM is a resilience feature you configure; not every fabric needs it.

## What happened?

1. OpenSM, using `libosmvendor` → `libibumad` (the same stack every other tool in this module uses),
   connected to `ibsim` through the intercepted `LD_PRELOAD` path.
2. It entered `DISCOVERING`, sent `NodeInfo`/`PortInfo`/`SwitchInfo` SMPs starting from its own bound port,
   and built its internal view of the topology.
   This is the same graph `ibnetdiscover` builds independently in IB02,
   but this time OpenSM *acts* on it.
3. Finding no competing SM, it moved directly to `MASTER`.
4. As MASTER, it assigned LIDs to every discovered port,
   ran its routing engine (MinHop by default; see IB14) to compute each switch's forwarding table,
   and pushed `SET(PortInfo)` MADs to move each port to `Active`.
5. `SUBNET UP` is OpenSM's own log line meaning this whole cycle completed successfully.

## Verification checklist

- [ ] Log shows `Entering DISCOVERING state` then `Entering MASTER state`, in that order
- [ ] Log eventually shows `SUBNET UP`
- [ ] A subsequent `discover.sh` (from another terminal,
      or after backgrounding via `start-opensm.sh`) shows real (non-zero) LIDs —
      proof the MASTER SM assigned them

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| OpenSM never prints `Entering MASTER state` | `ibsim` is not running, or crashed | Check `docker exec ibsim-lab tmux capture-pane -t ibsim -p` |
| `osm_vendor_bind: ... failed` | Another OpenSM instance is already bound in this container | `pkill -9 opensm` inside the container, then retry |
| Log shows `Entering STANDBY state` (you will not see this in this module, but if it happens) | A second, higher-priority SM already claimed MASTER | Expected behavior on a real dual-SM fabric, not a bug |

## Cleanup

```bash
./scripts/stop-sim.sh
```

## Optional challenge

Run OpenSM with `-V` (maximum verbosity) instead of `-v`, redirect it to a file,
and find the specific log lines where OpenSM (a) assigns Hca1's LID and (b) programs Switch1's forwarding table entry for that LID.
(Search for `assign_lid` and `Switch: Setting LFT`; line contents may vary slightly by build.)

## Interview questions

1. **Beginner:** What does "Entering MASTER state" mean OpenSM has decided?
2. **Intermediate:** Why does this lab never show a `STANDBY` state,
   and what would need to change about the topology/setup for it to appear?
3. **Senior SRE:** A fabric has two SMs configured for redundancy.
   The primary crashes.
   What do you expect to see in the standby's log, and how long should that take (conceptually,
   not as a specific number, since it is a configurable timeout)?
4. **Senior infrastructure engineer:** OpenSM logs everything to `/var/log/opensm.log` by default on real deployments.
   What operational risk does that create at scale (many fabrics, verbose logging)?
   How would you reduce it, using methods you would apply to any noisy daemon log,
   for example `logrotate`, shipping to a central sink, or dropping verbosity in steady state.

### Consolidated review: IB01-IB04

5. **Beginner:** Name the three environments this module explicitly says not to run `ibsim` in without a workaround,
   and why (see the top-level README's environment table).
6. **Intermediate:** IB02's `ibnetdiscover` ran with no SM active at all, and worked.
   IB03/IB04 needed OpenSM.
   What is the functional difference between what each tool needs to do its job?
7. **Senior SRE:** You are handed a fabric where `ibnetdiscover` shows all expected nodes and links,
   but every LID reads 0.
   What is your first hypothesis, and what single log file would confirm it?
8. **RDMA specialist:** Explain, in one paragraph, why `opensm`, `ibnetdiscover`,
   and `ibstat` all work unmodified against `ibsim` with nothing more than `LD_PRELOAD`.
   Name every layer the request passes through, real or simulated,
   from the tool's `main()` to `ibsim`'s response.
