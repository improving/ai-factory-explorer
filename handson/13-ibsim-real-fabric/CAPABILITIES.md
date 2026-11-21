# What is real here, and what is not

This module lets you practice fabric-management workflows without a $50k switch on your desk.
That practice has value only if you know the exact boundary of the simulation.
Read [ARCHITECTURE.md §7](ARCHITECTURE.md#7-data-plane-vs-controlmanagement-plane--the-one-distinction-that-matters-most) first,
for the one-sentence version.
This file gives the full, feature-by-feature version.
The team verified it against `ibsim` 0.10, OpenSM 3.3.23,
and `infiniband-diags` 50.0 while it built this module.

| Feature | Reality | Category |
|---|---|---|
| MAD/SMP exchange (discovery, `NodeInfo`/`PortInfo`/`SwitchInfo` queries) | Implemented in full. `ibsim` answers real MADs from real `libibumad` clients | **Genuine simulation** |
| LID assignment | OpenSM's real LID-assignment logic runs unmodified against `ibsim`'s simulated ports | **Genuine (real OpenSM logic, simulated fabric)** |
| Forwarding table (LFT) computation | OpenSM's real routing engines (min-hop, up/down, fat-tree, ...) run unmodified and write real LFT entries into `ibsim`'s simulated switches | **Genuine (real OpenSM logic, simulated fabric)** |
| `ibnetdiscover` / `iblinkinfo` / `ibroute` / `ibtracert` output | Computed from the simulated fabric's current state | **Genuine simulation** |
| Link up/down (`Unlink`/`ReLink` console commands) | Flips a simulated port's physical/logical state. OpenSM reacts to the flip (re-sweeps, re-routes) | **Genuine simulation** |
| Port/attribute error-rate injection (`Error` console command) | Injects a failure rate into `ibsim`'s responses to a *specific MAD attribute* (for example, make `PortInfo` queries fail N% of the time). This tests OpenSM and diag-tool resilience to **management-plane** packet loss and corruption | **Genuine, but scoped to MAD traffic only. See the "packet drop" caveat below** |
| Performance counters (`PerformanceSet`, read via `ibqueryerrors`) | You can set counter values by hand. Nothing increments them from real traffic | **Approximated / operator-set, not measured** |
| P_Key / partition *configuration* (`partitions.conf`, OpenSM's partition manager, `SET(PKeyTable)` MADs) | OpenSM's real partition-manager logic runs and programs real P_Key table entries into simulated ports. Inspect with `smpquery`/`saquery` | **Genuine (real OpenSM logic, simulated fabric)** |
| P_Key *enforcement* (a mismatched-P_Key send dropped by switch hardware) | Requires a QP that attempts to send data through a switch ASIC that checks P_Key on the data path. `ibsim` has no data path | **Needs real hardware** (or is explained, not demonstrated) |
| Multicast group creation/forwarding-table computation | OpenSM's real multicast-group and MFT logic runs against simulated ports (`MaxMcastCap` is a real, configurable `ibsim` limit) | **Genuine (real OpenSM logic, simulated fabric)** |
| Multicast *data delivery* | No data plane exists to deliver anything | **Needs real hardware** |
| Adaptive/dynamic routing reacting to congestion | `ibsim` has no notion of congestion, credits, or buffer occupancy | **Needs real hardware** |
| RDMA verbs (`ibv_*`), QP state machine, sends/writes/reads | Out of scope for `ibsim`. It only ever speaks MAD/SMP | **Needs real hardware, or Soft-RoCE/RXE for the verbs API itself** |
| Bandwidth, latency, jitter numbers | `ibsim` moves no payload bytes. Any timing you observe is Unix-socket/process-scheduling noise, not a wire measurement | **Needs real hardware** |
| Physical-layer effects (bit errors, marginal cables, temperature-induced flapping, optics degradation) | Not modeled at all. `Error` (above) is a MAD-layer construct, not a PHY-layer one | **Needs real hardware** |
| Switch ASIC/firmware behavior, vendor CLI, NOS-specific quirks | `ibsim`'s simulated switches are generic. No vendor firmware exists to differ from | **Needs real hardware** |
| Multi-subnet routing across an IB router | Not modeled. Every `ibsim` topology in this module is a single subnet | **Needs real hardware** (or is out of scope by design) |
| The RDMA verbs API surface, without needing an HCA | `libibverbs` plus a kernel `rdma_rxe` device over Ethernet moves bytes over UDP | **Available via Soft-RoCE/RXE, IB19** |
| Soft-RoCE performance numbers as a proxy for InfiniBand performance | RXE is RoCE (RDMA **over Converged Ethernet**) on a software Ethernet NIC. Its throughput and latency reflect your loopback/veth Ethernet path, not an IB HCA or IB switch fabric. RXE has **no LIDs, no SM, no `ibsim` involvement at all** | **Not a substitute for InfiniBand numbers. Do not treat the two as the same** |

## The "packet drop" caveat (IB11), stated once here so every lab can point back to it

`ibsim` has **no data plane**, so there is no way to drop a data packet in this simulator.
IB11 demonstrates the console's `Error "nodeid"[port] <rate> [attribute]` command.
This command makes `ibsim` fail a percentage of **MAD responses** for a given attribute (for example,
`PortInfo`, `NodeInfo`) on a given port.
This is a useful thing to practice:
it is the failure mode where OpenSM's management traffic to one port is unreliable.
But it is a **management-plane** fault injection, not a **data-plane** packet-loss simulation.
Real data-plane packet loss (congestion drops, CRC errors, a marginal cable) needs real hardware.
For the Ethernet/RoCE case, use tools like `tc netem` on a real or RXE-backed NIC (out of scope here).

## Summary: what this module gives you

- A hands-on feel for **fabric discovery, LID assignment, routing, and SM state transitions**.
  OpenSM's real code does real work, against a fabric made of process memory instead of copper.
- Practice with the **exact diagnostic commands** (`ibnetdiscover`,
  `ibroute`, `ibtracert`, `iblinkinfo`, `ibqueryerrors`, `ibportstate`,
  `ibping`) you use on a real fabric, with real output from a fabricated topology.
- Practice **triggering and recovering from control-plane failures** (link down,
  MAD error injection, OpenSM restart, topology change), and watching OpenSM's real reaction.
- **Zero** insight into real IB performance, physical-layer troubleshooting,
  vendor switch behavior, or the RDMA data path.
  For those, see `plan/learning-hardware.md`'s hardware tiers,
  H12's Mokka-based mock-IB tooling (a different, complementary simulation angle),
  IB19 (Soft-RoCE/RXE, for the verbs API only), and real InfiniBand hardware.
