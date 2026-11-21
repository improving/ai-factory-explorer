# IB17 — Failure injection / chaos lab

## Objective

Run through every failure mode this module supports, back to back,
in an SRE incident-response format: failure, symptom, diagnostic command,
OpenSM behavior, routing change, recovery.

## Concepts learned

- Consolidating IB10-IB12 and IB15's individual failure mechanics into one incident-response mental model.
- Two failure modes not covered elsewhere: OpenSM restarting mid-incident,
  and the simulator itself restarting.

## Prerequisites

- IB10, IB11, IB12, IB15.

## Topology

`topologies/two-switch.net`, except where noted.

## The chaos table

| # | Failure | Observed symptom | Diagnostic command | OpenSM behavior | Routing change | Recovery |
|---|---|---|---|---|---|---|
| 1 | HCA link down (`Unlink "Hca1"[1]`) | Hca1 vanishes from discovery; everything else unaffected | `discover.sh -l` | Trap, then `drop_mgr_remove_port` for Hca1 only | Hca1's LID freed; no other LFT entries change | `restore-link.sh '"Hca1"[1]'` |
| 2 | Switch-to-switch (ISL) link down (`Unlink "Switch1"[3]`) | Everything behind the far switch vanishes (IB10) | `discover.sh -l` | Trap, then `drop_mgr_remove_port` for the far switch and every CA behind it | Fabric partitions into two islands; no route exists between them at all | `restore-link.sh '"Switch1"[3]'` |
| 3 | Multiple link failures (both ISLs in `multipath.net`: `Unlink "Switch1"[2]` then `[3]`) | Switch2 and Switch3 both drop out if both fail; if only one fails, traffic uses the other (IB06) | `discover.sh -l`, `trace.sh` | Two traps, two re-sweeps (or one, if they land in the same sweep window) | Depends which links failed; see verification below | `restore-link.sh` on each |
| 4 | MAD error injection (`Error "Hca1"[1] 100 21`) | Specific queries to that port/attribute fail; topology/link state fully unaffected (IB11) | `smpquery portinfo <lid>` (repeatedly) | **None** — no trap exists for this; it is invisible to OpenSM unless OpenSM itself happens to query that exact attribute during a sweep | None | `Error "Hca1"[1] 0 21` |
| 5 | OpenSM restart mid-incident | While OpenSM is down, `ibnetdiscover` (independent of the SM) still reflects real-time physical state; **but LFTs are frozen at whatever OpenSM last computed** | `discover.sh` (works throughout); `ibroute` (returns stale tables) | None while down; on restart, a full fresh `DISCOVERING → MASTER` cycle re-syncs LFTs to current physical reality | LFTs jump straight to correct state on restart; no incremental catch-up needed | `start-opensm.sh` again |
| 6 | Simulator restart | Total reset: a fresh `ibsim` process re-parses the topology file from scratch; all LIDs are freshly (re-)assigned | `discover.sh -l` (nodes reappear, but compare GUIDs/LIDs carefully) | Full `DISCOVERING → MASTER` cycle, same as any first start (IB04) | Freshly computed, not preserved from before the restart | `stop-sim.sh` + `start-sim.sh` (already what a restart is, in this module) |
| 7 | Topology change (new switch cabled in live) | A previously invisible node appears; existing routes may shift (IB15) | `discover.sh -l`, `routes.sh` | Trap, then re-sweep, then LID assignment for the new node, then re-routing | May add new equal/shorter paths, may leave others unchanged | N/A — this is a fabric growing, not failing; recovery is normal operation afterward |

## Exact commands for scenario 5 (the one that is new in this lab)

```bash
cd 13-ibsim-real-fabric
./scripts/start-sim.sh two-switch
./scripts/start-opensm.sh
sleep 1

docker exec ibsim-lab pkill -9 opensm      # simulate OpenSM crashing/being restarted
sleep 1

./scripts/discover.sh -l                    # still fully accurate -- this is real-time, SM-independent
./scripts/routes.sh 1                       # still returns the LAST GOOD table OpenSM installed

./scripts/inject-failure.sh '"Switch1"[3]'  # break a link WHILE OpenSM is down
sleep 1
./scripts/discover.sh -l                    # reflects the break immediately (SM-independent)
./scripts/routes.sh 1                       # STILL shows the stale pre-failure table -- nobody updated it

./scripts/start-opensm.sh                   # OpenSM comes back
sleep 1
./scripts/routes.sh 1                       # now correctly reflects the current (post-failure) topology
```

## Expected output for scenario 5

After `pkill -9 opensm` and the subsequent `Unlink`,
`discover.sh -l` correctly shows only Switch1's side (matching IB10's post-failure output).
This is proof that discovery never depended on OpenSM being alive.
Meanwhile `routes.sh 1`, right after the `Unlink` and before restarting OpenSM,
still lists all 6 LIDs, including the now-unreachable ones behind Switch2:
a stale forwarding table, because nothing is running to notice the change and reprogram it.
Once `start-opensm.sh` runs again,
its fresh `DISCOVERING → MASTER` cycle rebuilds the table from current physical reality,
and `routes.sh 1` immediately reflects only the reachable nodes.

## What happened?

1. **Discovery is real-time and SM-independent** because it is a live directed-route walk every time you run it (IB02).
   There is no cache to go stale.
2. **Forwarding tables are not real-time.**
   They are a snapshot computed by whichever SM last ran a sweep, pushed once,
   and never touched again until the next sweep.
   An SM outage does not corrupt existing tables, but it does freeze them exactly where they were.
3. This is an important operational distinction:
   **the fabric looking fine in `ibnetdiscover` does not mean routing is current**,
   if there is reason to suspect the SM has been down or has not re-swept recently.

## Verification checklist

- [ ] Reproduced scenario 5 exactly and observed the stale-table window
- [ ] Can explain, without notes, why discovery and routing have different freshness guarantees
- [ ] Completed at least 4 of the 7 chaos table rows yourself (not only read about them)

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `routes.sh` after OpenSM restart still looks stale | Restart has not finished its sweep yet | Wait for `SUBNET UP` in the log before re-checking |
| Scenario 3 (multiple failures) leaves the fabric in a confusing state | Multiple overlapping changes are hard to reason about by design; that is realistic | Use `collect-diagnostics.sh` to snapshot everything at once rather than guessing from partial output |

## Cleanup

```bash
./scripts/stop-sim.sh
```

## Optional challenge

Design an 8th chaos scenario of your own (for example,
injecting `Error` on a switch's `SwitchInfo` attribute instead of a CA's `PortInfo`).
Predict its row in the table before running it, then verify.

## Interview questions

1. **Beginner:** Which is real-time and which can go stale: fabric discovery, or forwarding tables?
2. **Intermediate:** Why does a MAD-error injection (`Error`) never appear in OpenSM's log the way a link-down event does?
3. **Senior SRE:** You are paged for "intermittent connectivity" and confirm `ibnetdiscover` looks completely normal.
   Given this lab, what is your next hypothesis, and which command tests it?
4. **Senior infrastructure engineer:** Design a monitoring check that would have caught scenario 5,
   an SM outage that did not crash anything and only stopped updating,
   before a human noticed through a support ticket.
