# InfiniBand architecture, and where `ibsim` sits in it

Read this once before IB01.
Every lab links back to a section here instead of re-explaining the concept.

## 1. The physical fabric (what you would have with real hardware)

```
 Host A                                                         Host B
+--------+   IB link   +-----------+   IB link   +-----------+   IB link   +--------+
|  HCA   |=============|  IB       |=============|  IB       |=============|  HCA   |
| (port) |             |  Switch 1 |             |  Switch 2 |             | (port) |
+--------+             +-----------+             +-----------+             +--------+
                              |                         |
                        (more switch ports          (more switch ports
                         to more hosts/switches)     to more hosts/switches)
```

- **Host Channel Adapter (HCA):** the NIC-equivalent for InfiniBand.
  It is a PCIe card (or an on-die controller) with one or more **ports**.
  An application's RDMA verbs calls (`libibverbs`) ultimately talk to it.
- **Channel Adapter (CA):** the general term.
  An HCA is a CA that lives in a host.
  (You will also see "TCA" for a target channel adapter in storage contexts; out of scope here.)
- **IB switch:** a Layer-2-equivalent InfiniBand switch.
  It does **not** do IP routing.
  It forwards packets by **LID** (see below),
  using a per-switch **linear forwarding table (LFT)**: "packet addressed to LID X leaves on port Y."
  That is all: no TTL decrement, no ARP, no subnetting inside a single IB subnet.
- **IB port:** a physical port on an HCA or switch.
  Each port has its own **port GUID**, a **physical state** (Polling / LinkUp / ... ),
  and a **logical state** (Down / Init / Armed / Active).
  Both must reach the "good" end (LinkUp + Active) before user traffic flows through it.

## 2. Addressing: GUID vs LID vs GID

These three are **not interchangeable**.
Mixing them up is the most common beginner mistake.
Several labs deliberately make you distinguish them.

| | GUID | LID | GID |
|---|---|---|---|
| **Scope** | Globally unique (burned into hardware, like a MAC address) | **Locally** unique: meaningful only within one IB subnet | Globally routable: used when traffic must cross InfiniBand routers between subnets |
| **Size** | 64-bit | 16-bit (default LMC=0, meaning up to 49151 usable unicast LIDs per subnet) | 128-bit (subnet prefix + GUID, IPv6-shaped) |
| **Assigned by** | Vendor, at manufacture time (Node GUID, Port GUID, System Image GUID) | The **Subnet Manager**, during discovery. It can change every time the SM re-runs | Derived automatically from the subnet prefix and the port GUID |
| **Used for** | Identity: which physical port this is, forever | **Forwarding**: every switch's forwarding table is keyed by destination LID | RDMA CM / GID-based addressing, multi-subnet routing, RoCE (which has no LIDs at all and uses GIDs exclusively) |
| **Where you see it in this module** | `ibnetdiscover` topology dumps, `ibstat` | `ibroute`, `ibtracert`, `ibstat`'s "Base lid" | `ibstat`'s "GID" lines |

**In one sentence:** a GUID says *who* a port is.
A LID says *where* a switch should forward a packet right now.
A GID is the IB-native equivalent of an IPv6 address,
used above the plain unicast-LID-forwarding layer.

## 3. The Subnet Manager (SM) and Subnet Administrator (SA)

InfiniBand has no distributed routing protocol like OSPF.
Instead, **exactly one node in the subnet runs a Subnet Manager** (OpenSM, in every lab here) that:

1. **Discovers** the physical topology by walking the fabric with SMPs (Subnet Management Packets).
   It starts from itself, queries every port's `NodeInfo`/`PortInfo`/`SwitchInfo`,
   and follows every link it finds.
2. **Assigns LIDs** to every port that does not already have one.
3. **Computes routes**: fills in every switch's linear forwarding table,
   so that any LID is reachable from any port.
4. **Activates ports**: moves each port's logical state from Init to Armed to Active,
   once it is configured consistently.
5. **Keeps running.**
   This is not a one-shot job.
   It re-discovers and re-routes whenever it sees a topology change (a port bouncing,
   a new node appearing).
   You trigger this yourself in IB10 and IB15.

The **Subnet Administrator (SA)** is a logical service co-located with the SM (in OpenSM, the same process).
It answers *queries* about the subnet.
The most important query is **PathRecord** ("give me a path from GID/LID A to GID/LID B,
and its parameters").
This is how an application resolves a "how do I reach this GID" question,
before it opens an RC/UD connection.
You will not call the SA directly in these labs.
But every `ibtracert` run answers the same question the SA answers for real applications.

## 4. Management Datagrams (MADs)

All of the above (discovery, LID assignment,
route computation) happens by exchanging **MADs** (Management Datagrams).
MADs are IB's generic management-plane packet format,
carried on a well-known pair of Queue Pairs (QP0 for subnet management/SMPs,
QP1 for general services/SA, PerfMgr, and so on).
Every tool in this module (`opensm`, `ibnetdiscover`, `ibroute`,
`ibtracert`, `iblinkinfo`, `ibping`, ...) is, underneath, a MAD client.
**This is the exact layer `ibsim` simulates: nothing more, nothing less.**

## 5. Forwarding tables, PathRecords, partitions, multicast, link state: the labs that cover them

- **Forwarding tables (LFTs):** built by the SM, dumped by `ibroute`.
  See IB08.
- **PathRecords:** what `ibtracert` reconstructs hop by hop.
  See IB09.
- **Partitions / P_Key:** membership groups that restrict which ports may talk to which.
  See IB13 (with a note on what is demonstrable through `ibsim`'s MAD-only fabric,
  versus what needs real data traffic to prove).
- **Multicast:** LID-based group forwarding, configured via the SA.
  Mentioned in IB13/IB16 alongside partitions.
  `ibsim` supports multicast forwarding-table state (`MaxMcastCap` shown at every `ibsim` startup),
  but, like everything else here, only at the MAD/control-plane level.
- **Link state:** each port's physical/logical state.
  This is the mechanism behind IB10, IB11, IB15, IB17.

## 6. Where `ibsim` fits: the whole point of this module

Real hardware path (what you do not have, and do not need for this module):

```
Application
    |
libibverbs (data path: RDMA reads/writes/sends)
    |
ib_uverbs.ko (kernel)
    |
real HCA hardware  <==>  real wire  <==>  real IB switch ASIC
```

Management/control-plane path — **this is what `ibsim` replaces, transparently, below `libibumad`**:

```
Application/diagnostic (ibnetdiscover, opensm, ibroute, ibtracert, ...)
    |
libibumad / libibmad         <-- these tools call open()/read()/write() on /dev/umadX...
    |
ib_umad.ko (kernel)           <-- ...normally serviced by the kernel's umad device driver
    |
real HCA's management interface  <==>  real SMA/SA on every real switch/HCA
```

With `ibsim`, you replace the bottom two layers with a userspace shim,
and nothing above `libibumad` needs to know:

```
Application/diagnostic (ibnetdiscover, opensm, ibroute, ibtracert, ...)
    |
libibumad / libibmad                          (UNCHANGED — real, unmodified binaries)
    |
LD_PRELOAD=libumad2sim.so                     <-- intercepts the umad open/send/recv calls
    |
Unix domain socket (or TCP, for -r/--remote_mode)
    |
ibsim process                                  <-- userspace MAD/SMP responder + SM/SA behavior model
    |
in-memory simulated fabric (parsed from your .net topology file)
```

And for OpenSM specifically:

```
OpenSM  --(same libosmvendor -> libibumad path as above)-->  MADs  -->  LD_PRELOAD libumad2sim.so
    -->  ibsim  -->  simulated switches / HCAs / ports (LIDs, forwarding tables, link states)
```

**This is why real, unmodified `opensm` and `infiniband-diags` binaries run against a simulated fabric with zero recompilation:** they were never talking to hardware directly.
They were always talking to `libibumad`'s socket abstraction,
and `ibsim` answers that same abstraction.

## 7. Data plane vs. control/management plane — the one distinction that matters most

| | Control/management plane | Data plane |
|---|---|---|
| **Carries** | MADs/SMPs: discovery, LID assignment, routing, counters, partition config | Application RDMA sends, writes, and reads |
| **Protocol/QP** | QP0 (SMPs), QP1 (general services) | Any RC/UC/UD queue pair the application opens |
| **What `ibsim` simulates** | **Yes. This is ibsim's entire purpose.** | **No, never.** ibsim has no notion of an RDMA payload, a queue pair's data path, or bandwidth and latency. |
| **What proves this plane works** | `ibnetdiscover`, `opensm` reaching MASTER, `ibroute`, `ibtracert`, `iblinkinfo` all succeeding here | `ib_write_bw`/`ib_read_bw`/`ib_send_lat`, and similar tools, moving bytes. This needs real hardware or Soft-RoCE/RXE (IB19), never `ibsim` |

Keep this table in mind through every lab: everything you do here is control plane.
See [CAPABILITIES.md](CAPABILITIES.md) for the full,
lab-by-lab breakdown of what is simulated, what is approximated,
and what is impossible without real hardware or RXE.
