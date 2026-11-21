# IB18 — Build an InfiniBand troubleshooting runbook

## Objective

Consolidate every tool used across IB01-IB17 into one reference:
what each does, when to use it, a real example, its important fields,
and its common failure modes, including two genuine rough edges this module found and verified, not smoothed away.

## Concepts learned

- Which tool to use, in what order, for a given symptom.
- Two `infiniband-diags` quirks verified during this module's authoring,
  worth knowing before you meet them.

## Prerequisites

- All of IB01-IB17 (this lab is a reference, not new mechanics).

## The command reference

| Command | Purpose | When to use | Important fields | Common failure |
|---|---|---|---|---|
| `ibnetdiscover` | Full topology walk | First command for "what does this fabric look like right now" | GUIDs, LIDs, port widths/speeds, node names | Hangs/crashes with zero peers (H12's finding); needs `LD_PRELOAD` under `ibsim` (IB12 Scenario 6) |
| `ibroute <lid\|-G guid>` | Dump one switch's forwarding table | "Where does this switch send traffic for LID X" | Out port per LID | Fails by node name (IB08) — use LID or `-G` |
| `ibtracert <src-lid> <dst-lid>` | Trace one specific path, hop by hop | "What is the actual path between these two hosts" | Each hop's in/out port and LID | Fails cleanly if the path is broken partway (useful signal — see IB12's tree) |
| `iblinkinfo` | Every link's state, one line per port | "Which specific ports are down" fabric-wide | `Active/LinkUp` vs `Down/Polling`, width/speed | None found in this module's testing — reliable across all labs |
| `ibstat` | One device/port's detail, `ifconfig`-style | Deep-dive on a single port you already suspect | Base LID, SM LID, Port GUID, State, Physical state | Without `-C`/`-P`, defaults to whichever node `ibsim` attaches you as, not necessarily the one you meant (IB03) |
| `ibstatus` | Same idea as `ibstat`, older/simpler tool | Quick single-port check on real hardware | Similar to `ibstat` | **Verified in this module: fails with `Fatal error: No devices` against every `ibsim` topology tested** — a real gap in this tool's device-enumeration path under the umad2sim shim, not a topology problem. Use `ibstat` instead under `ibsim`. |
| `ibportstate <lid> <port>` | Query (and, on real hardware, change) one port's state | Checking exact port config fields; enabling/disabling a port | `LinkState`, `PhysLinkState`, `LinkWidth*`, `LinkSpeed*` | **Verified in this module: the initial `PortInfo` query succeeds and prints useful data, but a subsequent internal query this tool issues sometimes times out under `ibsim`** (`_do_madrpc: recv failed: Connection timed out`) — treat the first block of output as reliable, a trailing timeout as a known rough edge, not evidence the port is actually failing |
| `ibqueryerrors` | Fabric-wide error-counter scan | Routine health check; first command to run when something seems wrong | Per-port error/data counters vs. threshold | Under `ibsim`, **always reports 0 bad nodes/ports** since counters are never incremented by real traffic (CAPABILITIES.md) — do not mistake a clean `ibqueryerrors` run under this module for proof a real fabric is healthy |

## Worked examples (all captured live in this module)

```bash
# "What does this fabric look like" -- always start here
./scripts/discover.sh

# "Which switch sends X where" -- once you have a LID of interest
./scripts/routes.sh <lid>

# "What's the actual path" -- once you have source AND destination LIDs
./scripts/trace.sh <src-lid> <dst-lid>

# "Which specific link is down" -- fabric-wide port state in one shot
docker exec ibsim-lab bash -c 'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO iblinkinfo'

# "Full health snapshot, save it" -- bundles the above plus logs
./scripts/collect-diagnostics.sh
```

## The troubleshooting matrix

| Symptom | First command | What to inspect | Likely causes |
|---|---|---|---|
| "Host X cannot reach host Y" | `ibtracert <X's lid> <Y's lid>` | Where the trace stops, if it does | A link down partway (IB10); a stale LFT from an SM outage (IB17 scenario 5) |
| "A node is missing from discovery" | `discover.sh -l`, then `grep <name> topologies/*.net` | Is it in the topology file at all? Is its link up? | Never existed here (IB12 Scenario 4); a link/node failure (IB10) |
| "Routing changed unexpectedly" | `ibroute` on the relevant switch, before/after | Which port a given LID now uses | A topology change (IB15); a routing engine change (IB14); a failed/recovered redundant path (IB06/IB16) |
| "Intermittent failures, topology looks fine" | `ibqueryerrors` (real hardware) or re-check for `Error`-style MAD faults (this module) | Whether the SM is current (IB17 scenario 5), or a management-plane-only fault (IB11) | A stale LFT; a flaky management path; not necessarily a data-plane problem |
| "OpenSM seems stuck" | `opensm`'s own log, tail it | Last state transition logged (`DISCOVERING`/`MASTER`/`SUBNET UP`) | Never started; crashed; still sweeping a very large fabric |
| "Cannot tell if a partition is misconfigured" | `smpquery pkeytable <lid>` on the suspect port | Which P_Keys are present, full vs. limited membership bit | A missing/wrong `partitions.conf` entry (IB13) — remember this only proves config, not enforcement |

## Verification checklist

- [ ] Can name, from memory, which command answers each troubleshooting-matrix symptom
- [ ] Know the two verified `infiniband-diags` rough edges (`ibstatus`,
      `ibportstate`) well enough not to mistake them for fabric problems
- [ ] Can run `collect-diagnostics.sh` and explain every file it produces

## Troubleshooting

This lab is the troubleshooting reference.
If something here does not match what you observe,
check your `infiniband-diags`/OpenSM version against the ones this module was authored against (see `setup/verify.sh`'s output),
because exact error text can shift between releases.

## Cleanup

Nothing persistent to clean up — this lab only reads IB01-IB17's already-established knowledge.

## Optional challenge

Add a row to the troubleshooting matrix for a symptom this module did not explicitly cover (for example,
"OpenSM keeps flapping between DISCOVERING and MASTER").
Reason through which tool or log you would check first,
even without being able to reproduce it here.

## Interview questions

*(consolidated, covering IB17-IB18)*

1. **Beginner:** Which single command would you run first when you think something is wrong with this fabric,
   but do not know what yet?
2. **Intermediate:** Why is a clean `ibqueryerrors` run meaningless as a health signal under `ibsim`, specifically?
3. **Senior SRE:** Walk through your first 5 minutes, command by command,
   for "host X reports it lost RDMA connectivity to host Y",
   assuming this module's toolset, not real hardware's.
4. **Scenario:** OpenSM is running (confirmed by its log showing `SUBNET UP` recently),
   but an HCA is missing from `ibnetdiscover`.
   How would you troubleshoot it, in order?
