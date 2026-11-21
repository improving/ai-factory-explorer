# IB19 — Combine with Soft-RoCE/RXE

## Read this first: this lab's commands are not live-verified in this build

Every other lab in this module was run in a disposable Docker container,
and its output was captured live.
**This lab is different, on purpose:** Soft-RoCE (RXE) requires loading a real Linux kernel module (`rdma_rxe`) and creating a real network-backed RDMA device.
Docker Desktop on macOS runs containers inside a shared LinuxKit micro-VM that you do not control and cannot load kernel modules into,
so this cannot run in the same container as IB01-IB18 or IB20.

The commands below are transcribed from upstream sources:
`rdma-core`'s own [`Documentation/rxe.md`](https://github.com/linux-rdma/rdma-core/blob/master/Documentation/rxe.md),
the [`rdma-link(8)` man page](https://man7.org/linux/man-pages/man8/rdma-link.8.html),
and standard `perftest` (`ib_write_bw` et al.) usage.
They are not invented, but they were also not executed by this module's author on this machine.
Treat every "expected output" block in this lab as **illustrative,
from upstream examples**, not a guarantee,
and verify it yourself on real Linux (bare metal or a full VM,
not this module's Docker container) before you trust it operationally.

## Objective

Understand what Soft-RoCE is, how it differs from everything else in this module,
and get a real RDMA verbs data path running, something `ibsim` structurally cannot ever provide.

## Concepts learned

```
ibsim  = InfiniBand fabric/control-plane simulation (MAD/SMP only, no data path -- IB01-IB18)
RXE    = a real software RDMA/RoCE implementation (a real data path, over Ethernet, no LIDs, no SM,
         no ibsim involvement whatsoever)
```

These are two **completely separate** things that this module deliberately never combines into one fabric.
RXE does not run against `ibsim`; it does not go through OpenSM;
it has no LIDs at all (RoCE addresses by GID only).
If you have been building an intuition that "IB = LIDs, GUIDs,
an SM" from Labs 1-18, RXE is a useful contrast: it is RDMA verbs without any of that,
because RoCE is fundamentally an Ethernet-layer transport, not InfiniBand.

## Prerequisites (real Linux only — not this module's Docker setup)

- A real Linux machine or full VM (not a container) you can load kernel modules on:
  a bare-metal Linux box, a cloud VM,
  or a local VM via Multipass/UTM/Lima/VirtualBox/Parallels on macOS.
- Two such hosts (or two network namespaces / two containers *on top of* a real Linux VM with the `rdma_rxe` module already loaded on the host) on the same L2 network,
  to demonstrate a genuine two-sided RDMA transfer.
- Kernel module `rdma_rxe` available (on Ubuntu, typically in `linux-modules-extra-$(uname -r)`).

## Setup (per upstream `rdma-core` documentation)

```bash
# On a real Linux host/VM (NOT this module's ibsim-lab Docker container):
sudo apt update
sudo apt install -y rdma-core ibverbs-providers ibverbs-utils perftest \
    linux-modules-extra-$(uname -r)

sudo modprobe rdma_rxe

# Pick your active network interface (adjust for your host)
IF=$(ip -o route show default | awk '{print $5; exit}')
sudo rdma link add rxe0 type rxe netdev "$IF"

rdma link
ibv_devices
```

Illustrative expected output (from upstream examples — your device name/GUID will differ):

```
$ rdma link
link rxe0/1 state ACTIVE physical_state LINK_UP netdev eth0

$ ibv_devices
    device                 node GUID
    ------              ----------------
    rxe0                505400fffe78e0a6
```

## Running a real RDMA transfer (two hosts/VMs on the same network)

On the server:

```bash
ib_write_bw -d rxe0 -x 0
```

On the client (pointed at the server's IP address):

```bash
ib_write_bw -d rxe0 -x 0 <server-ip>
```

`-x 0` selects GID index 0, the default RoCE v1/v2 GID on most single-NIC setups.
Use `rdma link` or `ibv_devinfo -d rxe0` to confirm which GID index applies to your interface if `-x 0` does not work.

Other `perftest` tools follow the same client/server pattern:

```bash
ib_read_bw   -d rxe0 -x 0 [server-ip]     # RDMA read bandwidth
ib_send_bw   -d rxe0 -x 0 [server-ip]     # Send/Recv bandwidth (not RDMA read/write)
ib_send_lat  -d rxe0 -x 0 [server-ip]     # Send/Recv latency
```

## What this lab can demonstrate, and what it cannot

| | Can this lab show it? |
|---|---|
| The RDMA verbs API (`libibverbs`) working end to end, without any physical IB/RoCE hardware | **Yes** |
| A real RDMA write/read/send moving bytes over a real (software) network path | **Yes** |
| Real bandwidth/latency numbers | **Only for your software NIC path** — this measures a software RXE device over a real (or virtual) Ethernet link, generally far below what real IB or hardware RoCE NICs achieve; do not use these numbers as a proxy for InfiniBand performance |
| LIDs, an SM, OpenSM, fabric discovery via `ibnetdiscover` | **No — RXE has none of these; it is a different addressing/management model entirely (GID-only, no SM)** |
| Anything about `ibsim`, or a combined "ibsim fabric with an RXE data path" | **No — this module never connects these two tools, nor does any documented upstream workflow the author is aware of** |

## Verification checklist (if you run this on real Linux)

- [ ] `rdma link` shows `rxe0` in state `ACTIVE`
- [ ] `ibv_devices` lists `rxe0`
- [ ] `ib_write_bw` (or another perftest tool) completes a run between two hosts and reports non-zero bandwidth

## Troubleshooting (from upstream sources, not this module's own testing)

| Symptom | Likely cause | Fix |
|---|---|---|
| `rxe0` never appears after `rdma link add` | `rdma_rxe` module not loaded, or missing `linux-modules-extra` package | `sudo modprobe rdma_rxe`; install `linux-modules-extra-$(uname -r)` and reboot if the module is not available |
| `rdma link add` fails outright | `rdma-core` not installed, or wrong interface name in `netdev` | Confirm `rdma` binary exists (`rdma-core` package); confirm the interface name with `ip link` |
| `ib_write_bw` hangs waiting for the peer | Server-side `ib_write_bw` (no destination arg) not started first, or a firewall blocking the connection | Start the server side first; check firewall rules between the two hosts |

## Cleanup

```bash
sudo rdma link delete rxe0
sudo modprobe -r rdma_rxe
```

## Optional challenge

If you have access to a real Linux VM, run this lab for real and capture your own output.
Compare your measured bandwidth/latency against this lab's caveat that RXE numbers are not representative of real InfiniBand.
By how much do they differ, roughly,
and why (software packet processing versus dedicated HCA silicon)?

## Interview questions

1. **Beginner:** Why can `ibsim`'s labs (1-18) and this lab's RXE setup not be combined into one fabric?
2. **Intermediate:** RXE addresses peers by GID, with no LIDs and no Subnet Manager.
   What does that imply about how a RoCE network's topology is managed,
   compared to InfiniBand's centralized SM model?
3. **Senior SRE:** A team reports that RDMA works in their dev environment (RXE on VMs) but performance is terrible in production (real RoCE NICs).
   Is that surprising, and what would you tell them about using RXE for pre-production functional testing versus performance testing?
4. **RDMA specialist:** Real RoCEv2 traffic is UDP-encapsulated and DSCP/PFC-aware for lossless delivery in production deployments.
   Does this lab's basic RXE setup demonstrate any of that congestion-control machinery?
   What would you need to add to test it?
