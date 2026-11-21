# IB02 — Your first simulated InfiniBand fabric

## Objective

Start `ibsim` on the smallest possible topology, and run a real diagnostic tool against it.

## Concepts learned

- The `ibsim` topology file format.
- The `LD_PRELOAD=libumad2sim.so` mechanism (ARCHITECTURE.md §6), seen live for the first time.
- Why `ibnetdiscover` "sees" a fabric that only exists as a text file and a running process.

## Prerequisites

- IB01 complete (`ibsim-lab:latest` image built and verified).

## Topology

[`topologies/simple.net`](../topologies/simple.net):

```
Hca1 --- Switch1 --- Hca2
```

## Exact commands

Start the simulator:

```bash
cd 13-ibsim-real-fabric
./scripts/start-sim.sh simple
```

This does three things, in order.
You can also do them by hand; see "What happened?" below.

1. `docker run -d --name ibsim-lab ... ibsim-lab:latest`.
   This starts a container with `topologies/` bind-mounted read-only at `/lab/topologies`.
2. `docker exec ... tmux new-session -d -s ibsim 'ibsim -s /lab/topologies/simple.net | tee /lab/ibsim.log'`.
   This runs `ibsim` inside a detached tmux session, so later labs can send it console commands.
3. Prints the first lines of the `ibsim` console, so you can see it started.

Now run the diagnostic:

```bash
./scripts/discover.sh
```

which runs, inside the container:

```bash
SO=$(find /usr/lib -iname "libumad2sim*.so" | head -1)
LD_PRELOAD="$SO" ibnetdiscover
```

## Expected output

*Example output.
Exact values may differ.
`ibsim` assigns GUIDs in the order nodes appear in the topology file,
so these specific values should reproduce.*

```
ibwarn: [46] sim_connect: attached as client 0 at node "Switch1"
#
# Topology file: generated on Fri Sep 25 05:19:04 2026
#
# Initiated from node 0000000000200000 port 0000000000200000

vendid=0x0
devid=0x0
sysimgguid=0x200000
switchguid=0x200000(200000)
Switch	8 "S-0000000000200000"		# "Switch1" base port 0 lid 0 lmc 0
[1]	"H-0000000000100000"[1](100001) 		# "Hca1" lid 0 4xSDR
[2]	"H-0000000000100003"[1](100004) 		# "Hca2" lid 0 4xSDR

vendid=0x0
devid=0x0
sysimgguid=0x100003
caguid=0x100003
Ca	2 "H-0000000000100003"		# "Hca2"
[1](100004) 	"S-0000000000200000"[2]		# lid 0 lmc 0 "Switch1" lid 0 4xSDR

vendid=0x0
devid=0x0
sysimgguid=0x100000
caguid=0x100000
Ca	2 "H-0000000000100000"		# "Hca1"
[1](100001) 	"S-0000000000200000"[1]		# lid 0 lmc 0 "Switch1" lid 0 4xSDR
```

Field annotations:

```
switchguid=0x200000(200000)   -> node GUID assigned to Switch1 by ibsim, from the topology file order
Switch  8  "S-...200000"      -> "Switch", 8 ports, ibsim's synthetic node name
# "Switch1"                    -> the human-readable name YOU gave it in the .net file
base port 0 lid 0 lmc 0        -> lid 0 means no LID assigned yet -- no SM has run (IB04 fixes this)
[1] "H-...100000"[1](100001)   -> Switch1 port 1 connects to Hca1's port 1; (100001) is that port's GUID
```

Every LID reads `0`.
This is expected: **discovery (`ibnetdiscover`) does not require or assign LIDs.**
It walks the fabric using directed-route SMPs (physical port by port),
which work before any Subnet Manager has run.
LID assignment is the SM's job.
See IB04.

## What happened?

1. `ibsim` parsed `simple.net`, built an in-memory graph of 1 switch + 2 HCAs,
   and opened a listening Unix-domain socket for MAD traffic.
2. `ibnetdiscover`, an unmodified binary from `infiniband-diags`, called `umad_init()` via `libibumad`.
   Because `LD_PRELOAD=libumad2sim.so` was set,
   the call was intercepted before it tried to open `/dev/umad0`.
   That device does not exist in this container; there is no kernel IB driver at all.
3. `libumad2sim.so` connected to `ibsim`'s Unix socket instead and began exchanging real SMPs (`NodeInfo`,
   `PortInfo`, ...) over it.
4. `ibnetdiscover`'s normal breadth-first directed-route walk proceeded exactly as it would against real hardware,
   discovering Switch1's 2 active ports and following each to an HCA.
5. `ibnetdiscover` formatted the results in its usual topology-file-compatible output.
   This is the same format `ibsim` accepts as a `.net` file,
   which is how you normally seed `ibsim` from a real cluster snapshot.

## Verification checklist

- [ ] `scripts/start-sim.sh simple` reports the container running and the `ibsim` console banner
- [ ] `scripts/discover.sh` exits 0 and lists exactly 1 switch + 2 CAs
- [ ] Every LID in the output reads `0` (no SM has run yet)

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ERROR: container 'ibsim-lab' is already running` | A previous lab's container was left running | `./scripts/stop-sim.sh` first |
| `ibnetdiscover` hangs | `ibsim` is not running (the tmux session died) | `docker exec ibsim-lab tmux ls`. If empty, re-run `start-sim.sh`; check `docker logs ibsim-lab` |
| `sim_connect: ... No such file or directory` | `LD_PRELOAD` pointed at a `.so` that does not exist (wrong architecture path) | Use `scripts/discover.sh`, which auto-detects the path via `find`, instead of a hardcoded one |

## Cleanup

```bash
./scripts/stop-sim.sh
```

## Optional challenge

Edit a copy of `topologies/simple.net` to add a third HCA (`Hca3`) on Switch1 port 3.
Load it (`./scripts/start-sim.sh <your-file-without-.net>`),
and confirm `ibnetdiscover` now reports 3 CAs.
Find the *two* places in the file you had to change (hint:
both the switch's port list and a new `Hca` record).

## Interview questions

*(asked again, consolidated, after IB04)*

1. **Beginner:** Why do all the LIDs read `0` in this lab's output?
2. **Intermediate:** `ibnetdiscover` needed no SM to run.
   What kind of routing (directed-route vs. LID-routed) must it use internally,
   and why does that matter for discovering a fabric with no LIDs assigned yet?
3. **RDMA specialist:** Real `ibnetdiscover` output is often used to *seed* `ibsim` for another test run.
   What real-cluster workflow does that enable that this lab's authored-by-hand `.net` file does not demonstrate?
