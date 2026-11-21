# IB12 — OpenSM troubleshooting

## Objective

Deliberately break six different things, one at a time.
Observe each real symptom.
Build a decision tree you can use when you do not already know which of these it is.

## Concepts learned

- Distinguishing "no SM running" from "link down" from "misconfigured client" from "bad topology file",
  based on symptoms alone.
- A practical troubleshooting decision tree for when something is wrong with this fabric.

## Prerequisites

- IB04, IB08, IB09, IB10, IB11.

## Topology

`topologies/two-switch.net`, except where noted.

## Scenario 1: OpenSM not running

```bash
./scripts/start-sim.sh two-switch
./scripts/discover.sh -l          # deliberately skip start-opensm.sh
./scripts/routes.sh 1
./scripts/trace.sh 1 2
```

**Symptom:** `discover.sh` succeeds fully.
Directed-route discovery needs no SM (IB02).
`ibroute` and `ibtracert` both fail:

```
ibwarn: [45] sim_connect: attached as client 0 at node "Switch1"
ibwarn: [45] mad_rpc: _do_madrpc failed; dport (Lid 1)
ibroute: iberror: failed: dump tables: node info failed: valid addr?
```
```
ibwarn: [56] find_route: can't reach to/from ports
ibwarn: [56] get_route: can't find a route to the src port
ibtracert: iberror: failed: Failed to get route information
```

**Root cause:** no LIDs exist yet.
`discover.sh`'s output shows `lid 0` for everything; check that first.
**Resolution:** run `./scripts/start-opensm.sh`.

## Scenario 2: Invalid topology file

```bash
docker exec ibsim-lab bash -c 'echo "not a real topology" > /tmp/bad.net'
docker exec ibsim-lab ibsim -s /tmp/bad.net
```

**Symptom:**

```
parsing: /tmp/bad.net
/tmp/bad.net: parsed 1 lines
ibpanic: [13] main: sim_init failed, status -3: Success
```

**Root cause:** the file is not in `ibsim`'s node/port-record format (ARCHITECTURE.md/IB02's format description).
**Resolution:** fix the file, or start from a known-good one under `topologies/`.

## Scenario 3: Link down

Covered in full in IB10.
The symptom is nodes disappearing from `ibnetdiscover`/`ibroute`/`ibtracert` after a genuine `Unlink`.
OpenSM's log shows `Link state change` and `drop_mgr_remove_port`.

## Scenario 4: Missing node

This is the same underlying mechanism as Scenario 3, from the querying tool's point of view.
If a node is absent from `discover.sh -l` that you expected to see,
the two possible causes are the same as IB10's troubleshooting table:
either its link is down, or it was never in the topology file.
Confirm which with `grep <name> topologies/<file>.net`.
If it is not in the file, it was never going to appear, no matter what OpenSM does.

## Scenario 5: Multiple possible paths (not a problem, but looks like one)

Covered in IB06.
If you expected traffic on Switch3 (in `multipath.net`) and only see it on Switch2, that is not a bug.
Re-read IB06's "why not both paths" explanation before you assume something is broken.

## Scenario 6: Incorrect simulator configuration (missing `LD_PRELOAD`)

```bash
docker exec ibsim-lab ibnetdiscover
```

(note: no `LD_PRELOAD` set; this is the mistake)

**Symptom:**

```
ibwarn: [13] get_abi_version: can't read ABI version from /sys/class/infiniband_mad/abi_version (No such file or directory): is ib_umad module loaded?
ibwarn: [13] mad_rpc_open_port: can't open UMAD port ((null):0)
./libibnetdisc/ibnetdisc.c:798; can't open MAD port ((null):0)
ibnetdiscover: iberror: failed: discover failed
```

**Root cause:** without `LD_PRELOAD=libumad2sim.so`,
the tool tried to talk to a real kernel UMAD device that does not exist in this container.
There is no `ib_umad.ko` (see ARCHITECTURE.md §6).
**Resolution:** use `scripts/discover.sh`, which sets this correctly,
instead of calling the binary directly.
Or always export `LD_PRELOAD` yourself first.

## The troubleshooting decision tree

```
"ibnetdiscover shows fewer nodes than expected" or "ibroute/ibtracert fails"
   |
   +-- Does `discover.sh` even run without a umad-port error?
   |      |
   |      +-- No ("can't open MAD port") -> Scenario 6: LD_PRELOAD not set. Fix the client invocation.
   |      |
   |      +-- Yes, continue
   |
   +-- Do the missing/expected nodes exist in the topology FILE at all? (grep the .net file)
   |      |
   |      +-- No -> Scenario 4a: never existed here. Not a fault -- fix your expectation or the file.
   |      |
   |      +-- Yes, continue
   |
   +-- Does `ibroute`/`ibtracert` fail with "node info failed: valid addr?" / "can't find a route"?
   |      |
   |      +-- Yes, and every LID in `discover.sh` reads 0 -> Scenario 1: OpenSM isn't running/hasn't
   |      |     finished. Run/wait for start-opensm.sh; check for "SUBNET UP" in its log.
   |      |
   |      +-- No (LIDs ARE assigned), continue
   |
   +-- Are the missing nodes reachable via a DIFFERENT switch than you expected?
   |      |
   |      +-- Yes -> Scenario 5: not a fault. Re-read IB06 -- single-path-per-LID is expected behavior.
   |      |
   |      +-- No, continue
   |
   +-- Check OpenSM's log for "Link state change" / "drop_mgr_remove_port" around the time nodes vanished
          |
          +-- Present -> Scenario 3/4b: a real link went down (Unlink, or a real cable/port fault on
          |     real hardware). Find which port with `iblinkinfo`; see IB10/IB18.
          |
          +-- Absent, and ibsim itself won't start -> Scenario 2: check the topology file's syntax
                first (a parse error prevents ibsim from starting at all, which is a different failure
                mode than a fabric that starts but has a bad link).
```

## Verification checklist

- [ ] Reproduced all 6 scenarios' exact symptoms
- [ ] Can state, from the symptom alone, which scenario you are in, without re-reading this lab
- [ ] Used the decision tree once, without looking (have a partner or your future self trigger one at random)

## Troubleshooting the troubleshooting lab

| Symptom | Cause | Fix |
|---|---|---|
| Scenario 1's `ibroute` error looks different than shown | `infiniband-diags` version differences change the exact wording | The exit code (255) and the general "cannot resolve" or "cannot find" shape is what to check, not the exact text |

## Cleanup

```bash
./scripts/stop-sim.sh
```

## Optional challenge

Combine two scenarios at once.
For example, break a link and stop OpenSM before it re-converges.
Use the decision tree to work out which symptom belongs to which cause.

## Interview questions

*(consolidated, covering IB09-IB12)*

1. **Beginner:** `ibnetdiscover` works but `ibroute` does not.
   What is the single most likely explanation?
2. **Intermediate:** How do you tell "OpenSM has not converged yet" apart from "OpenSM crashed," using only the tools in this module?
3. **Senior SRE:** Write a 3-step first-response checklist for a host that reports it cannot reach another host,
   on a real IB fabric.
   Use only what this lab's decision tree taught you.
   You do not have `ib_write_bw` results, only discovery and routing tools.
4. **Senior infrastructure engineer:** Scenario 6 (missing `LD_PRELOAD`) is a testing-environment-only mistake.
   It has no real-hardware equivalent.
   Why is it still worth a dedicated scenario in a troubleshooting lab like this one?
5. **RDMA specialist:** In Scenario 1, which SMP/MAD attribute lookup does `ibroute` fail on first?
   Why does that specific failure prove "no LIDs assigned" rather than "no route computed"?
