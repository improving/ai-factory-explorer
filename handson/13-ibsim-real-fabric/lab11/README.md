# IB11 — "Packet drop" simulation (management-plane error injection)

## Objective

Use `ibsim`'s `Error` console command to make a specific port fail a specific kind of MAD query.
Understand what this does and does not simulate.
Read [CAPABILITIES.md's "packet drop" caveat](../CAPABILITIES.md#the-packet-drop-caveat-ib11-stated-once-here-so-every-lab-can-point-back-to-it) before you start,
if you have not already.

## Concepts learned

- `ibsim`'s `Error "nodeid"[port] <rate> [attribute]` console command.
- The difference between **link down** (IB10: the port itself goes `Down`/`Polling`,
  topology changes) and **management-plane error injection** (this lab:
  the port stays `Active`, only some MAD queries to it start failing).
- Why this is not "real packet drop," and what real packet drop would require.

## Prerequisites

- IB10 (contrast point), IB03 (`smpquery`).

## Topology

`topologies/two-switch.net` again.

## Exact commands

```bash
cd 13-ibsim-real-fabric
./scripts/start-sim.sh two-switch
./scripts/start-opensm.sh
sleep 1

# Baseline: this succeeds every time
docker exec ibsim-lab bash -c \
  'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO smpquery portinfo 2'

# Inject a 100% failure rate for PortInfo (attribute 21) queries on Hca1's port 1
docker exec ibsim-lab tmux send-keys -t ibsim 'Error "Hca1"[1] 100 21' Enter
sleep 1

# Repeat the same query several times
for i in 1 2 3; do
  docker exec ibsim-lab bash -c \
    'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO smpquery portinfo 2'
done

# Meanwhile, the fabric's TOPOLOGY is unaffected -- unlike IB10
./scripts/discover.sh -l

# Reset the error rate back to 0
docker exec ibsim-lab tmux send-keys -t ibsim 'Error "Hca1"[1] 0 21' Enter
sleep 1
docker exec ibsim-lab bash -c \
  'SO=$(find /usr/lib -iname "libumad2sim*.so"|head -1); LD_PRELOAD=$SO smpquery portinfo 2'
```

## Expected output

Baseline query succeeds:

```
# Port info: Lid 2 port 0
Mkey:............................<not displayed>
GidPrefix:.......................0xfe80000000000000
Lid:.............................2
...
```

After `Error "Hca1"[1] 100 21`, the **same** query fails, every time, deterministically at rate 100:

```
ibwarn: [95] sim_connect: attached as client 1 at node "Switch1"
ibwarn: [95] mad_rpc: _do_madrpc failed; dport (Lid 2)
smpquery: iberror: failed: smp query portinfo failed
```

*(Testing confirmed: rate 100 gives 0 successes out of 10, and rate 0 gives full recovery.
Rates between 0 and 100 produce intermittent failures.
The observed failure fraction did not track the configured rate at a 1:1 ratio.
Treat "rate" as roughly how often the failure happens, not as an exact percentage guarantee.
Use rate 100 or rate 0 for any demo that needs a deterministic result.)*

`discover.sh -l`, run during the 100%-error injection, still shows all 6 nodes, unlike IB10:

```
Ca	 : 0x0000000000100009 ports 2 devid 0x0 vendid 0x0 "Hca4"
Ca	 : 0x0000000000100006 ports 2 devid 0x0 vendid 0x0 "Hca3"
Ca	 : 0x0000000000100003 ports 2 devid 0x0 vendid 0x0 "Hca2"
Ca	 : 0x0000000000100000 ports 2 devid 0x0 vendid 0x0 "Hca1"
Switch	 : 0x0000000000200001 ports 8 devid 0x0 vendid 0x0 "Switch2"
Switch	 : 0x0000000000200000 ports 8 devid 0x0 vendid 0x0 "Switch1"
```

**This is the crucial difference from IB10.**
The port's physical or logical state never changed.
`iblinkinfo`/`ibnetdiscover` still see an `Active`/`LinkUp` port with a valid GUID and LID.
Only the specific query type you targeted (`PortInfo`, attribute 21) is failing,
and only against the specific port you targeted.
`ibnetdiscover`'s own walk uses different attribute traffic patterns and paths,
and it was not necessarily hitting the exact failing combination in this run.
This is itself a realistic lesson:
**a management-plane fault can be invisible to some tools and visible to others**,
depending on which attributes and ports they query.

After `Error "Hca1"[1] 0 21`, queries succeed again immediately.
No re-sweep is needed, because nothing about the topology ever changed.

## Link-down vs. MAD-error-injection, side by side

| | IB10 (`Unlink`) | IB11 (`Error`) |
|---|---|---|
| Port physical/logical state | Changes to `Down`/`Polling` | **Unchanged**. Stays `Active`/`LinkUp`. |
| Visible in `ibnetdiscover`/`iblinkinfo` | Yes. The node disappears. | **No**. The node is still fully visible. |
| OpenSM reaction | Trap, re-sweep, `drop_mgr_remove_port`, re-route | **None**. OpenSM has no "MAD reliability" trap. It experiences failed or retried transactions to that attribute only if it happens to query it. |
| What it represents on real hardware | A cable pulled, a port disabled, a switch rebooted | A flaky or overloaded management path: for example a CPU-starved SMA, a congested QP1, or a marginal but not-yet-down link that corrupts some MADs |
| Is this "packet drop"? | No. It is link state. | **Also no. This is MAD-response-layer behavior, not data-plane behavior.** `ibsim` cannot drop a data packet, because it never carries data packets. |

## What happened?

1. `Error "Hca1"[1] 100 21` told `ibsim` to fail on purpose,
   and not respond correctly, for a percentage of incoming MADs that targeted **attribute 21 (PortInfo)** addressed to Hca1's port 1 only.
   It left every other attribute and every other port answering normally.
2. `smpquery portinfo 2` sends a `Get(PortInfo)` SMP to LID 2 (Hca1),
   attribute 21, and hits the injected failure directly.
3. `libibmad`'s RPC layer (`mad_rpc`) retried per its normal timeout and retry policy,
   used up its attempts, and returned failure to `smpquery`, which reported it.
4. Nothing about the port's actual `PortInfo` state (the thing being queried),
   or its link state, was ever touched.
   This is purely a case where the answer to this specific question,
   for this specific port, sometimes does not arrive.

## Verification checklist

- [ ] `smpquery portinfo 2` succeeds before injection
- [ ] `Error "Hca1"[1] 100 21` makes it fail deterministically afterward
- [ ] `discover.sh -l` during injection still shows all 6 nodes (topology unaffected)
- [ ] `Error "Hca1"[1] 0 21` restores success

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Query still succeeds after `Error ... 100 21` | Wrong attribute number, or targeted wrong node or port | Attribute 21 = PortInfo, 17 = NodeInfo, 16 = NodeDescription; match the query you are running |
| Query still fails after resetting to rate 0 | tmux command did not land (session busy) | Re-check with `tmux capture-pane -t ibsim -p` that the `Error ... 0 21` line was processed |

## Cleanup

```bash
./scripts/stop-sim.sh
```

## Optional challenge

Inject the same `Error` against attribute **17 (NodeInfo)** instead of 21,
then confirm that `smpquery nodeinfo 2` fails while `smpquery portinfo 2` keeps succeeding.
This proves the failure is scoped to the exact attribute you named, not to the whole port.

## Interview questions

*(asked again, consolidated after IB12)*

1. **Beginner:** Why does `ibnetdiscover` not necessarily show anything wrong while `Error` is active on a port?
2. **Intermediate:** Give a real-world failure mode that this lab's `Error` injection is a reasonable stand-in for,
   and one that it is not a reasonable stand-in for.
3. **Senior SRE:** Real monitoring (`ibqueryerrors`, IB18) reports port error counters,
   not MAD success/failure rates.
   If a port were experiencing this lab's exact failure mode on real hardware,
   would you expect `ibqueryerrors` to catch it?
   Why or why not?
