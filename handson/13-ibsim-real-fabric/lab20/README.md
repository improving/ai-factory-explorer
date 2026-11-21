# IB20 — Final capstone

## Objective

Diagnose a fabric with multiple overlapping problems using only the symptoms and the tools from IB01-IB18.
No shortcuts, and no peeking at the setup script until you have formed your own hypothesis.

## Setup (run this, then stop reading until you have worked the problem)

```bash
cd 13-ibsim-real-fabric
./lab20/setup-broken-state.sh
```

This loads a topology, configures OpenSM, and puts the fabric into a broken state.
**Do not open `lab20/setup-broken-state.sh` or `lab20/solution.md` until you have worked through the investigation steps** —
those files reveal exactly what is wrong.

## Symptoms (this is all you get)

- Application teams report **intermittent RDMA connectivity** between hosts on this fabric.
- **One host can reach some HCAs but not others** — reachability seems inconsistent,
  not a clean all-or-nothing outage.
- OpenSM's log shows it has **reported at least one topology change** recently.
- Looking at one switch's forwarding table, an experienced engineer would call it **suspicious** —
  an unusually large fraction of destinations funnel through a single port.

That is all the information given here.
The steps below are the investigation; the solution is in [solution.md](solution.md),
folded, so try the steps yourself first.

## Your task

Using only the tools from IB01-IB18 (`discover.sh`, `routes.sh`,
`trace.sh`, `iblinkinfo`, `smpquery`, OpenSM's log, `collect-diagnostics.sh`):

1. Identify which node(s) are affected.
2. Discover the current topology.
3. Inspect port states.
4. Inspect LIDs.
5. Inspect forwarding tables.
6. Trace a path between a working pair and a suspected-broken pair.
7. Identify the failure(s) — there is more than one.
8. Restore the fabric.
9. Verify recovery.

Suggested commands to run, in whatever order makes sense to you:

```bash
./scripts/discover.sh -l
docker exec ibsim-lab bash -c 'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO iblinkinfo'
docker exec ibsim-lab tail -n 30 /lab/opensm.log
./scripts/routes.sh 1        # (or whichever switch's LID you find first)
./scripts/trace.sh <lid> <lid>
docker exec ibsim-lab bash -c 'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO smpquery pkeytable <lid>'
```

## Verification checklist

- [ ] Identified all three independent problems before reading [the solution](solution.md)
- [ ] Restored the fabric and confirmed `discover.sh -l` is consistent across repeated runs
- [ ] Confirmed Hca4's P_Key table matches every other host's after the fix

## Cleanup

```bash
./scripts/stop-sim.sh
```

## Interview questions

1. **Beginner:** Which of this capstone's three problems was visible in `iblinkinfo` alone?
2. **Intermediate:** Why did the same `discover.sh -l` command give different results on different runs,
   and what does that tell you about the underlying fault type?
3. **Senior SRE:** Rank this capstone's three problems by how you would prioritize fixing them in a real incident,
   and justify the order.
4. **Senior infrastructure engineer:** Design one proactive check (using only this module's tools) that would have caught problem #3 (the partition misconfiguration) before any application team reported it.
5. **RDMA/InfiniBand specialist:** Problem #2's `Error` injection is scoped to `PortInfo` (attribute 21) only.
   Name a different attribute an SRE might see failing in a real incident that would point toward a routing/forwarding issue rather than a basic connectivity one, and explain why.
