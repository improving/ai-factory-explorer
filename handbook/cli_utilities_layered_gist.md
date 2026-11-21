# SRE CLI Utilities — Layered Gist

> Source: distilled from `ai-platform-sre-training/handbook/command-reference.md`.
> Focus: every command a trainee must know, re-organized by **which layer of the stack it inspects**, with plain-language "what it does" and "when to reach for it" notes.
>
> The runbooks in [runbooks/](../runbooks/README.md) cite these layers and sections in their provenance tags (`[C:L2]`, `[C:§10]`).

## 0. The stack at a glance

```
┌─────────────────────────────────────────────────────────────┐
│ L8  Observability        Prometheus exporters, Alertmanager │
│ L7  Platform             Kubernetes (Rafay), Slurm          │
│ L6  Application          Collectives: NCCL/RCCL, Python     │
│ L5  Storage              VAST NFS mounts, local NVMe        │
│ L4  Network fabric       InfiniBand / RoCE links, switches  │
│ L3  In-node GPU fabric   NVLink, NVSwitch, Fabric Manager   │
│ L2  GPU + node software  nvidia-smi, dcgmi, amd-smi         │
│ L1  CPU / OS / hardware  lspci, lstopo, ipmitool, dmesg     │
└─────────────────────────────────────────────────────────────┘
```

Rule of thumb: **work the layers bottom-up when triaging** — confirm the hardware, then the GPU, then the fabric, then the network, before blaming the job.

Quick glossary: **HCA** = InfiniBand host adapter · **LID** = fabric address of an IB port · **ECC** = memory error correction counters · **Xid** = NVIDIA GPU driver error event · **RAS** = AMD's equivalent reliability/error report · **PFC/ECN** = RoCE congestion signals · **NUMA** = CPU/memory locality domains.

---

## L1 — CPU, OS, and base hardware

Tools that see the physical box: PCIe tree, NUMA layout, BMC sensors, kernel log, drives.

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `lspci -tv` | Draws the PCIe tree: which GPU, NIC, NVMe hangs off which switch | A GPU "fell off the bus" (Xid 79); PCIe AER events |
| `lstopo` | Shows NUMA nodes, cores, and which devices sit on each | Checking GPU↔NIC affinity; pinning dataloaders |
| `ipmitool sensor` | Reads BMC sensors: temps, fans, voltages, power | Thermal/power alarm; a node that won't boot |
| `ipmitool sel list` | Dumps the BMC system event log | Reboot with no kernel log; suspected hardware fault |
| `dmesg -T` | Kernel log, timestamped: Xid, PCIe AER, NVMe messages | Every hardware alert. Filter: `grep -iE 'xid\|aer\|nvme'` |
| `nvme list` / `nvme smart-log /dev/nvme0` | Local NVMe drives and health (media errors, wear) | Local disk failure or slow local cache |
| `chronyc tracking` / `chronyc sources` | Node's time offset and NTP sources | Weird TLS/token errors; `NotReady` node with no other cause |

**Vendor add-on:** `racadm techsupreport collect` + `export` — collects Dell SupportAssist evidence for an RMA case.

---

## L2 — GPU and node software

The `nvidia-smi` / `dcgmi` families for NVIDIA; `amd-smi` family as the AMD mirror.

### NVIDIA

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `nvidia-smi` | GPU list, temp, power, memory, running processes | **First command on every GPU alert** |
| `nvidia-smi -q` | Full GPU state: clocks, throttle reasons, ECC mode, driver version | GPU slow or hot |
| `nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE` | ECC error counts, row-remap state, throttle reasons | Xid 48/63/64/94/95; before an RMA decision |
| `nvidia-bug-report.sh` | Builds the full evidence bundle for NVIDIA support | Every RMA case; every unexplained Xid |

### NVIDIA health checks (DCGM)

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `dcgmi health -c` | Health-watch result per GPU | Before returning a node to service |
| `dcgmi diag -r 1` | Quick diagnostic (seconds) | Between jobs (epilog); a suspect node |
| `dcgmi diag -r 3` | Long diagnostic (~15 min, stresses GPUs) | After repair; before return to service. **Drain first** |
| `dcgmi diag -r 4` | Extended hardware diagnostic (longer stress) | New-node acceptance; suspected silent defect. **Drain first** |
| `dcgmi dmon --list` | Lists DCGM field IDs you can watch | Writing a new alert rule or custom metric |

### AMD

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `amd-smi list` | AMD GPUs the driver sees | First on every AMD GPU alert |
| `amd-smi metric` | Power, temp, clocks, memory, activity per GPU | AMD GPU slow or hot |
| `amd-smi metric --ecc` | ECC error counts (total + per block) | RAS `ue`/`ce` counter growth |
| `amd-smi ras` | Decoded RAS (CPER) entries — the AMD Xid equivalent | Investigating an AMD error event |
| `amd-smi bad-pages` | Retired VRAM pages | Before an AMD RMA decision |
| `amd-smi xgmi` / `amd-smi topology` | Infinity Fabric links and GPU topology | Slow AMD collective |
| `amd-smi firmware` / `amd-smi version` | Firmware and ROCm versions | Upgrade check vs. ROCm compatibility matrix |
| `cat /sys/class/drm/card*/device/ras/*_err_count` | RAS error counters per hardware block | Alerting on AMD RAS counters |

---

## L3 — In-node GPU fabric (NVLink / NVSwitch)

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `nvidia-smi topo -m` | GPU↔GPU and GPU↔NIC path matrix (NV#, PIX, PXB, PHB, NODE, SYS) | NCCL picked a slow transport; new-node acceptance |
| `nvidia-smi nvlink -s` | NVLink state + error counters per link | Xid 74/149; DCGM NVLink counter growth |
| `systemctl status nvidia-fabricmanager` | Fabric Manager service state | CUDA init fails on an NVSwitch system |
| `journalctl -u nvidia-fabricmanager` | Fabric Manager log | Any Fabric Manager alert |
| `nvidia-imex-ctl` | IMEX daemon state/connections on NVL72 compute tray | Multi-node NVLink job can't start; FM/IMEX alert |
| `kubectl get computedomains,resourceclaims -A` | ComputeDomain objects + IMEX channel claims (NVL72) | Multi-node NVLink job can't start (see L7) |

---

## L4 — Network fabric (InfiniBand / RoCE)

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `ibstat` | Local HCA ports: state, rate, LID | Node lost the fabric; port down |
| `iblinkinfo` | Every fabric link with speed and width | Link below rate; link flap |
| `ibnetdiscover` | Fabric topology: which port → which switch | Port-map validation; a cable moved |
| `perfquery -x` | Extended port counters: symbol errors, link downed, RX errors, discards | A slow link — check before blaming a cable |
| `ibdiagnet` | Full fabric scan with error report | First command on a fabric-wide problem; run weekly |
| `mlxlink -d <dev> -p <port>` | Physical link detail: speed, BER, optical power/temp | Cable or transceiver fault |
| `ib_write_bw` / `ib_write_lat` (two nodes) | Raw RDMA bandwidth/latency, no NCCL | Separating a fabric fault from a NCCL fault |
| `ethtool <nic>` | Ethernet NIC link speed and state | NIC negotiated a lower speed |
| `ethtool -S <nic>` | NIC counters; on RoCE: PFC pause + ECN counters | RoCE congestion; PFC storm; packet drops |
| `lsmod \| grep -E 'nvidia_peermem\|ib_core'` | Is GPUDirect RDMA support loaded? | NCCL fell back to host-memory path |
| `ufm_ha_cluster status` | Which UFM unit is active; pair state | UFM event; subnet-manager failover |
| `nv show qos roce` | RoCE QoS state on a Cumulus storage leaf | Slow storage over RDMA; PFC/ECN growth |

### UFM appliance commands (beyond HA status)

UFM is the subnet manager + fabric monitor for the InfiniBand side (2 units, active/standby). Most day-to-day work is the GUI or REST API, but the appliance CLI covers ops tasks.

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `ufm_ha_cluster start` / `stop` | Starts or stops the UFM service under HA | Controlled UFM restart during a change |
| `ufm_ha_cluster takeover` / `failover` | Forces this unit active / hands over to standby | Planned failover; testing HA |
| `ufm_ha_cluster config` | Configures the HA pair (peer IP, VIP, role) | Initial setup or repair of the HA pair |
| `systemctl status ufm_telemetry` | UFM Telemetry service state | Fabric counters missing from dashboards |
| `/opt/ufm/scripts/collect_logs.sh` *(check the path on your release)* | Collects UFM logs/diagnostics bundle | Evidence for an NVIDIA support case |
| UFM REST API via `curl -H "Authorization: Basic ..." https://<ufm>/ufmRest/...` | Links, ports, alarms, topology, PKeys programmatically | Automation: PKey provisioning, scripted fabric checks (Netris uses this for partition keys) |

### Cumulus NVUE `nv` commands (beyond `qos roce`)

`nv` is the single CLI on Cumulus Linux (SN-series storage/frontend leaves). Pattern: `nv show ...` reads, `nv set/unset` + `nv config apply` + `nv config save` writes.

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `nv show interface` | State of all ports (up/down, speed, MTU) | Port down; overview of a leaf |
| `nv show interface <swp> link` | One port's link detail: speed, autoneg, FEC | A port negotiated wrong speed/FEC |
| `nv show interface <swp> counters` | Per-port packet/error counters | Drops or errors on a storage port |
| `nv show interface <swp> counters qos` | QoS-class counters: PFC pauses, ECN marks, drops | PFC storm; RoCE congestion (pairs with `ethtool -S` on the node) |
| `nv show qos roce status` | Effective RoCE QoS state (PFC/ECN applied classes) | Verifying lossless config actually applied |
| `nv show system` / `nv show platform` | Hostname, uptime, OS version / hardware model, serial, PSU/fan state | First look at a switch; inventory checks |
| `nv show router bgp` / `nv show vrf` | BGP sessions, VRF routing state | Frontend/storage routing problem |
| `nv show service` | State of switch services (lldpd, ntp, frr, netq-agent…) | Switch agent down; NTP broken on a leaf |
| `nv config diff -o commands` | Pending config vs. running, shown as commands | Before `apply` — review what a change will do |
| `nv config apply` / `nv config save` | Applies staged config / persists to startup | Any config change (state-changing — see §10) |
| `nv config detach` | Rolls back to auto-detected baseline config | Emergency "undo my changes" |

---

## L5 — Storage (VAST Data + local disks)

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `mount -o vers=3,nconnect=<n>,spread_reads,spread_writes,remoteports=dns,localports=<range> <vip>:/<export> /mnt/vast` | VAST NFS mount with multipath. `nconnect` = 8 per 100 Gb/s TCP, 2 per 100 Gb/s RDMA (min 8) | Client with low throughput |
| `nfsstat -m` | Mount options actually in use on each NFS mount | Client isn't using multipath options |
| `fio` (`--ioengine=libaio --direct=1`, seq + random) | Bandwidth/latency of a mount or NVMe | Separating storage fault from dataloader fault |
| `mdtest`, `elbencho` | Metadata ops/sec; unified file+object benchmark | Metadata storm; checkpoint write rate |
| `vperfcheck` | Baseline of network+storage path from one client (VAST, built on elbencho) | Before filing a VAST performance ticket |
| `iostat -x 1` | Device utilization, queue depth, service time | Slow local disk or saturated mount |
| `biolatency` (bcc) | Histogram of block-I/O latency | Tail latency that `iostat` averages away |
| `vastpy-cli --json get clusters` | Cluster state from VMS | **First VAST command in an incident** |
| `vastpy-cli get vippools` / `get views` | VIP pools and views | Which CNodes serve a client; quota questions |
| `vms list` / `vms modify --preferred-cnode-ids <id>` | Where VMS runs; move it to another CNode | VMS unavailable |
| `supportbundle create --prefix <name> --preset <preset>` | VAST support bundle (presets: Standard, Performance, NFS, HW, RCA…) | Evidence for VAST support |
| `kubectl get pvc -A` | PVC state (VAST CSI) | Claim stuck in `Pending` |

---

## L6 — Application layer: collectives and processes

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `NCCL_DEBUG=INFO all_reduce_perf -b 8 -e 8G -f 2 -g <gpus>` | Topology NCCL found, transport chosen, bus BW by message size | Node acceptance; slow job; after fabric repair |
| `mpirun -np <n> -H <hosts> all_reduce_perf ...` | Same test across nodes | Bisection search for a defective node pair |
| `NCCL_DEBUG=INFO`, `NCCL_DEBUG_SUBSYS=INIT,NET` | NCCL log detail (second limits to init + network) | Job hangs at start; wrong NIC selected |
| `rccl-tests all_reduce_perf` | Same test on AMD Instinct | AMD node acceptance |
| `py-spy dump --pid <pid>` | Live Python stack without stopping the process | Hung rank — what call it's waiting in |
| PyTorch Flight Recorder (`TORCH_NCCL_TRACE_BUFFER_SIZE` + dump) | Per-rank collective calls; which rank never entered | NCCL watchdog timeout |

---

## L7 — Platform (Kubernetes via Rafay, Slurm)

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `kubectl get nodes -o wide` | Node state (`Ready`/`NotReady`), version, IP | Any node alert from Rafay |
| `kubectl describe node <node>` | Allocatable GPUs, taints, conditions, events | Pod can't get a GPU; Node Problem Detector taint |
| `kubectl get pods -n gpu-operator` | GPU Operator components: driver, toolkit, device plugin, DCGM exporter | Pod `Running` but no GPU |
| `kubectl logs -n gpu-operator <driver pod>` | Driver container log | Driver pod crash-looping after upgrade |
| `kubectl describe pod <pod>` | Pod events: scheduling, ContainerCreating, device claims | Pod stuck `Pending` / `ContainerCreating` |
| `kubectl get workloads -A` (Kueue) | Queued jobs and why they wait | Gang job stuck in queue |
| `rctl` | Rafay CLI: clusters, blueprints, projects | Scripted blueprint-version check across clusters |
| `rcollect` | Support logs of a self-hosted Rafay controller | Controller degraded |
| `radm` (controller nodes only) | Install/upgrade/restore self-hosted Rafay controller | L3 only, via change procedure L7 or restore runbook R8 |
| `kubectl get backups -n velero` / `describe backup` | Rafay controller backup state | Daily health check; before controller upgrade |
| `sinfo -R` | Slurm nodes down/drained + reason | Slurm node alert |
| `scontrol show node <node>` | Full Slurm node state incl. GRES | Job can't get a GPU on Slurm |
| `squeue` / `sacct -j <job>` | Queue; job accounting record | Job didn't start or failed |

---

## L8 — Observability

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `curl -s localhost:9400/metrics \| grep DCGM_FI` | Metrics dcgm-exporter is exposing | Metric missing from dashboard |
| `curl -s localhost:9100/metrics` | Node exporter metrics | Host metric missing |
| `journalctl -k` | Kernel log via journald | Xid search |
| `amtool` | Active alerts, silences, routing | Alert storm; silence during a change |

---

## 9. Cross-layer triage cheat sheet

### "The job is slow"

| # | Step | Layer checked |
|---|------|---------------|
| 1 | `nvidia-smi` on a job node — all GPUs present? Any throttled/low-clock? | L2 GPU |
| 2 | Per-rank step time from logs — one straggler or all slow? | L6 App |
| 3 | `perfquery -x` + `iblinkinfo` on the slow rank's nodes — symbol errors, link down, speed | L4 Fabric |
| 4 | DCGM profiling metrics (SM activity, not "GPU util") — saw-tooth = data/storage stall | L8 Obs / L5 Storage |
| 5 | `all_reduce_perf` on the slow rank's node pair vs. acceptance threshold | L6/L4 |

### "The job is hung"

| # | Step | Layer checked |
|---|------|---------------|
| 1 | `py-spy dump --pid <pid>` on one rank — blocked in NCCL? data read? file write? | L6 App |
| 2 | `dmesg -T \| grep -i xid` on every job node — Xid in the last hour? | L1/L2 |
| 3 | PyTorch Flight Recorder dump — which rank never entered the collective? | L6 App |
| 4 | `nvidia-smi` on that rank's node — GPU still present? | L2 GPU |
| 5 | `iblinkinfo` + subnet-manager log for that node — link flap in last hour? | L4 Fabric |

---

## 10. Commands that change state

Run only inside a runbook step, with the blast radius written down first.

| Command | Does | Safety rule |
|---------|------|-------------|
| `nvidia-smi -r -i <gpu>` | Resets one GPU | No processes on it; not if part of a live NVLink-domain job |
| `nvidia-smi -pl <watts> -i <gpu>` | Sets a power cap | Thermal mitigation only — record it, remove after |
| `kubectl cordon` / `kubectl drain --ignore-daemonsets` | Stops new pods; evicts running ones | On NVL72 one drain can stop a 72-GPU job — check ComputeDomain |
| `kubectl uncordon` | Returns node to scheduling | Only after return-to-service tests pass |
| `scontrol update ... State=DRAIN Reason="<ticket>"` | Drains a Slurm node | Always include the ticket number as reason |
| `scontrol update ... State=RESUME` | Returns a Slurm node | Same rule as `uncordon` |
| `systemctl restart nvidia-fabricmanager` | Restarts FM | Kills every CUDA context on the NVSwitch system — drain first |
| `vms modify --preferred-cnode-ids <id>` | Moves VMS | Management plane only; data path stays up |
| Rafay blueprint version change | Rolls add-on change to all clusters on the blueprint | Canary cluster first; drift mode "notify" during roll |
| `nvfwupd` (DGX) | Updates BMC/BIOS/GPU/NIC firmware | Only via change procedure L7; some parts need AC power cycle |
| Reboot / BMC power cycle | Restarts the node | Only after drain; never on an active IMEX domain without the job owner |
| `ufm_versions_mgr backup` | UFM config backup, no downtime | Scheduled (L15) + before any UFM change; in HA it's on the active unit — copy after failover |
| `ufm_ha_cluster takeover` / `failover` / `stop` | Forces UFM failover or stops the service | Changes which unit manages the fabric — change window only |
| `nv config apply` / `nv config save` / `nv config detach` | Applies, persists, or rolls back Cumulus config | Review with `nv config diff` first; storage-fabric changes can drop RoCE sessions |
| `ufm_versions_mgr restore` | Restores UFM from backup | Use `--dry-run` first; stops UFM — change window only |
| `etcdctl snapshot save <file>` | etcd snapshot | Before control-plane changes; part of the M7 restore drill |
| `radm` | Rafay controller install/upgrade/restore | L3 only, via procedure L7 or runbook R8 |

---

## 11. NCCL troubleshooting playbook

> Source: [NCCL User Guide — Troubleshooting](https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/troubleshooting.html) and its sub-pages, distilled to the commands and the scenarios where you'd reach for them. Variable details live in `nccl_env_vars_gist.md`; this section maps **symptom → what to run first**.

### 11.1 First move: NCCL self-diagnostics

NCCL ≥2.31 can verify its own communication paths during communicator init — run this *before* suspecting the application.

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `NCCL_RUN_DIAGNOSTICS=1 <app>` | Runs active diagnostics at every comm-init; rank 0 prints `NCCL DIAG [OK]`/`[INFO]` lines | Node acceptance; after repair; init failures with no clear error |
| (same run) P2P check | Every GPU pair reads/writes its peer; reports `only N/M peer accesses passed` with the failing pair | Suspected NVLink/PCIe P2P fault |
| (same run) net bw check | Auto-runs `ib_write_bw` pairwise between nodes, prints min/median/max + ranks >30% off median | Suspected inter-node fabric fault; needs `ib_write_bw` installed + resolvable hostnames |
| `ncclras` (RAS diagnostics) | Passive readiness probe comparing GPU inventory, driver versions, ECC, Xids, NVLink state, `NCCL_*` envs, PCI/IOMMU/ATS across ranks | Any running job — see 11.6 |

`[INFO]` ≠ fatal — init continues; it's a pointer, not a verdict.

### 11.2 Scenario: job hangs or fails during init

| # | Step | What it tells you |
|---|------|-------------------|
| 1 | Rerun with `NCCL_DEBUG=WARN` (or `INFO`) | `ncclSystemError`/`ncclUnhandledCudaError` = external/system fault; `ncclInvalidArgument`/`ncclInvalidUsage` = app bug |
| 2 | `NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,BOOTSTRAP,NET` | Bootstrap connection failures, wrong interface picked, rank sync stalls |
| 3 | Wrong interface? Set `NCCL_SOCKET_IFNAME=<if>` | NCCL grabbed `docker0`/an UP-but-dead interface |
| 4 | `mpirun -np <n> -N <ppn> hostname` → then build+run `cpi` (mpich example) | MPI itself broken before NCCL even starts |
| 5 | `ip -br link \| grep LOWER_UP` | Which interfaces are actually connected — feed to MPI |

**MPI-side fixes (Open MPI/HPC-X):**

| Command / setting | Fixes |
|---------|-------|
| `export OMPI_MCA_btl_tcp_if_include=<if>` (or `_if_exclude=lo,docker0,virbr0`) | Hang at startup / segfault in `libmpi.so` — MPI picked wrong interface. Never set include *and* exclude together |
| `export PMIX_MCA_gds=hash` | `PMIX ERROR: ... gds_ds12_lock_pthread.c` on older Open MPI |
| `export UCX_NET_DEVICES=<dev>` | `UCX WARN network device 'X' is not available` |
| `export UCX_TLS=self,sm,tcp` | `UCX ERROR no active messages transport ... Unsupported operation` |
| `export OMPI_MCA_pml=^ucx OMPI_MCA_coll_hcoll_enable=0 OMPI_MCA_btl=self,tcp` | Last resort: drop UCX entirely, plain TCP |

**Resource limits that kill init:**

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `ulimit -l` | Pinned-memory limit | `Call to ibv_reg_mr failed` / `ibv_create_qp failed` — fix: `* soft/hard memlock unlimited` in `limits.conf` (re-login or new Slurm job to take effect) |
| `ulimit -n` and `cat /proc/sys/fs/file-max` | Per-process and system fd limits | Failures at scale — a 144-rank job can need >32K fds/process |
| `ulimit -s` | Stack size — `8192` is correct; **`unlimited` is the bug** | Crash during comm-init: glibc *shrinks* NCCL helper-thread stacks to 2 MB when limit is `unlimited` |
| `df -h /dev/shm` / docker `--shm-size=1g --ulimit memlock=-1` | Shared-memory headroom | `failed to extend /dev/shm/nccl-*` — Docker defaults are too small |
| `grep RemoveIPC /etc/systemd/logind.conf` | systemd wiping `/dev/shm` of "not logged in" users | `unlink shared memory /dev/shm/nccl-* failed` under mpirun/Slurm — set `RemoveIPC=no`, restart `systemd-logind` (system-level — change window) |
| `NCCL_CUMEM_HOST_ENABLE=0` | Falls back to `/dev/shm` path | cuMem host alloc issues (missing NUMA in container, driver <13.0 without P2P); NCCL ≥2.26.5 auto-falls back |

### 11.3 Scenario: intra-node GPU path suspect

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `nvidia-smi topo -p2p p` | GPU↔GPU PCIe peer-access matrix (all `OK` = healthy) | NCCL avoids P2P or hangs on PCIe systems |
| `nvidia-smi topo -p2p n` | Same over NVLink | NVLink P2P question |
| `nvidia-smi topo -m` | Full path matrix (also shows GPU↔NIC distance) | Which NIC *should* serve which GPU (see L3) |
| `simpleP2P` (cuda-samples, needs build) | Data-validated P2P copy test; must end `Test passed` | `topo -p2p` says OK but transfers still fail |
| `nvbandwidth` | Measured GPU↔GPU bandwidth (NVLink or PCIe) | P2P works but slow — get real numbers vs spec |
| `NCCL_P2P_DISABLE=1` / `NCCL_P2P_LEVEL=<n>` | A/B test with P2P off or restricted | Isolating whether P2P transport is the problem |
| `cat /proc/cmdline`; `dmesg \| grep -iE 'iommu\|dmar'` | Is IOMMU in *translated* mode? (`Default domain type: Translated`) | Bare-metal PCIe P2P broken/corrupting despite `topo -p2p` OK — disable IOMMU for the GPU path |
| `lspci -vvv \| grep ACSCtl` (`SrcValid+` = ACS on) | PCI ACS redirects P2P to root complex → slow/hang | Same symptom as IOMMU; fix via BIOS (VT-d off) or `setpci -s <bdf> ECAP_ACS+0x6.w=0000` per PLX bridge (system-level — change window; re-applies each reboot) |
| `lsmod \| grep nvidia_peermem` | GDRDMA kernel module loaded? | GPU→NIC direct path missing (DMA-BUF kernels don't need it) |

VM/container caveat: NCCL reads topology from `/sys` — a virtualized `/sys` means a wrong topology and silent slowness.

### 11.4 Scenario: inter-node / fabric path suspect

| # | Step | What it tells you |
|---|------|-------------------|
| 1 | `ibstatus` / `ibstat` | Port `Active`, `LinkUp`, expected rate, right link layer (IB vs Ethernet for RoCE) |
| 2 | `ib_write_bw -d <dev> -a` (server) / `ib_write_bw -d <dev> <host> -a` (client) | Raw RDMA bandwidth, no NCCL — separates fabric fault from NCCL fault (add `--use_cuda=<id>` for GPU memory path, `--use_cuda_dmabuf` where supported) |
| 3 | `ib_write_lat -d <dev>` same pattern | Stalls/tail latency even when bandwidth looks fine → congestion or degraded link |
| 4 | `rdma statistic` while test runs | Growing `rnr_nak_retry_err`, `packet_seq_err`, `local_ack_timeout_err` = loss/retry at transport layer |
| 5 | `mlxlink -d <mst_dev>` | Link width/speed/BER when bw or latency degraded with no software cause |

**InfiniBand-specific:**

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `sminfo` | Is a Subnet Manager alive? | Nothing IB works at all |
| `perfquery -x <lid>` | `SymbolErrorCounter`, `LinkErrorRecoveryCounter`, `LinkDownedCounter` | Cable/switch suspect on one port |
| `ibping -S` (remote) + `ibping <lid>` (local) | Connectivity when `ibstat` looks clean | "Port is up but unreachable" |
| `ibdiagnet` | Full-fabric topology + error report | One rail repeatedly slow/failing; fabric-wide issues (see L4) |

**RoCE-specific:**

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `ethtool -S <nic>` | Drops, pause frames, PFC counters | Lossless fabric misconfig; congestion |
| PFC/ECN/CNP/queue-drop counters (NIC + switch, e.g. `nv show interface <swp> counters qos`) | Congestion indicators growing with latency tails | RoCE "works but slow" — fix congestion config before touching NCCL |
| `rping -s -a <srv_ip> -V -C 10` (remote) + `rping -c -a <srv_ip> -S <cli_ip> -V -C 10` | RDMA connectivity test | Port clean but can't connect |
| `show_gids` → `NCCL_IB_GID_INDEX` | RoCE v2 GID selection | `ibv_modify_qp failed ... Invalid argument` on NCCL <2.21 — on ≥2.21 do **not** set it; may need `NCCL_IB_TC` per fabric vendor |

**Firewall note:** pin NCCL's TCP range with `net.ipv4.ip_local_port_range` (e.g. `50000 51000`) so the firewall can permit exactly that range.

### 11.5 Scenario: job runs but is slow

Baselining first — prove the hardware can do it before blaming NCCL config:

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `nvbandwidth` (default build) | Intra-node GPU↔GPU and memory bandwidth | Compare vs `nvidia-smi topo -m` expectations |
| `nvbandwidth -p multinode` (build with `cmake -DMULTINODE=1`) | Inter-node GPU bandwidth | Multi-node job slow |
| `mpirun -n <n> nvloom -s pairwise --sizeMin 1M --sizeMax 4G` (also `multicast`, `gpu-to-rack rack-to-rack fabric-stress`) | Alternative benchmark incl. NVLink SHARP | Same, on SHARP systems |
| `NCCL_DEBUG=INFO all_reduce_perf -b 8 -e 8G -f 2 -g <gpus>` | NCCL-level bus BW by size (see L6) | The acceptance-test number |

**MNNVL (multi-node NVLink, NVL72-class):** if MNNVL should be used but isn't (`NCCL_MNNVL_ENABLE` not 0):

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `nvidia-imex-ctl -H -N` | IMEX domain state — want all nodes `READY`, matrix `C` | `UNAVAILABLE`/`I/N/D` = node down; `V` = driver mismatch between nodes |
| `nvidia-smi -q \| grep -v GUID \| grep -A4 Fabric` | NVLink fabric status + cliqueId per node | No IMEX access — cliqueId must match across domain nodes |
| `ls -l /dev/nvidia-caps-imex-channels/channel*` | Write access to IMEX channel files | `Cuda failure 800 'operation not permitted'` — user lacks write perms |

**NCCL tuning knobs** (after system checks pass; NVIDIA discourages these in production — a win here can be a loss elsewhere):

| Variable | Try when |
|----------|----------|
| `NCCL_MIN_CTAS` / `NCCL_MAX_CTAS` | More CTAs → more throughput, more GPU resource use |
| `NCCL_BUFFSIZE` | Bigger buffers on high-latency nets; smaller can help some PCIe topologies |
| `NCCL_CROSS_NIC` | Ranks using different NICs on different nodes — may help unoptimized rails, may cause congestion (default 2) |
| `NCCL_IB_QPS_PER_CONNECTION>1` | RoCE networks that need multiple QPs to saturate |

**CPU/memory affinity** — wrong placement quietly costs performance:

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,GRAPH,ENV` → grep `ncclTopoGetCpuAffinity` | What affinity NCCL actually applied | Verifying placement |
| `lscpu --extended=CPU,NODE,SOCKET,CORE` + `nvidia-smi topo -m` | CPU/NUMA vs GPU/NIC locality | Deciding placement (see L1) |
| `mpirun --map-by ppr:1:numa:PE=<cores> --bind-to core --report-bindings` | Open MPI rank/CPU placement + verification | Multi-rank jobs on NUMA hosts |
| `numactl --cpunodebind/--membind` | Manual pinning | Direct launches / wrapper scripts |
| `NCCL_IGNORE_CPU_AFFINITY=1` | NCCL ignores inherited affinity, uses GPU's | Launcher set a bad cpuset |

### 11.6 Scenario: job hung mid-run — ask RAS

NCCL ≥2.24 runs a lightweight RAS thread per process (TCP on the bootstrap network, separate from RDMA traffic). Query any rank's socket — default `localhost:28028`:

| Command | What it does | Reach for it when |
|---------|--------------|-------------------|
| `ncclras` | Job + communicator summary | First look at a hung job |
| `ncclras -v` / `-t <sec>` | Verbose output (names more outlier ranks) / longer timeout | Summary too coarse; huge job |
| `ncclras -f json` | Machine-parsable dump (per-rank status, collective counts, missing ranks) | Scripting/alerting on hang detection |
| `ncclras -m` | Monitor mode — streams events like `PEER_DEAD` until Ctrl+C | Watching a degrading job live |
| `echo verbose status \| nc localhost 28028` | Same query without the binary (`STATUS`, `VERBOSE STATUS`, `TIMEOUT <s>`, `MONITOR`, `CONTROL PROFILER_MASK <v>`) | `ncclras` not installed |
| `ncclras CONTROL PROFILER_MASK none` | Toggle profiler events job-wide at runtime | Enable/disable NCCL Telemetry without restart (NCCL ≥2.31) |

**Reading the output:** `MISMATCH` with increasing op counts across queries = benign imbalance — ignore it. `MISMATCH` frozen across queries = stuck communicator. `INCOMPLETE` + `TIMEOUT` = a process is unresponsive; after ~60 s it's declared `DEAD` with the exact PID/node/GPU. RAS diagnostics additionally report GPU inventory, driver-version skew, ECC counters, Xid/SXid events, NVLink state, `NCCL_*` env inconsistencies, and PCI/IOMMU/ATS problems via `rdma_topo check`.

### 11.7 NCCL logging quick reference

| Variable | Values | Reach for it when |
|----------|--------|-------------------|
| `NCCL_DEBUG` | `VERSION` < `WARN` < `ATTN` < `INFO` < `TRACE` | `WARN` = production baseline; `ATTN` = noteworthy notices without `INFO` volume; `TRACE` = replayable traces, NCCL-dev level |
| `NCCL_DEBUG_LEVELS` | Adds levels on top of `NCCL_DEBUG` (union) | `NCCL_DEBUG=WARN NCCL_DEBUG_LEVELS=ATTN` on mixed-version fleets |
| `NCCL_DEBUG_SUBSYS` | `INIT,NET,GRAPH,TUNING,COLL,P2P,SHM,NVLS,PROXY,BOOTSTRAP,ENV,REG,ALLOC,PROFILE,RAS,DESTROY,CALL,ALL` (default `INIT,BOOTSTRAP,ENV`) | Cutting `INFO` noise to the suspected subsystem |
| `NCCL_DEBUG_FILE=/path/nccl_%h_%p.log` | `%h` hostname, `%p` PID — one file per process | Multi-node jobs — stop grepping interleaved stdout |
| `NCCL_DEBUG_TIMESTAMP_FORMAT` / `NCCL_DEBUG_TIMESTAMP_LEVELS` | strftime format / which levels get timestamps (default: only `WARN`) | Correlating NCCL events with `dmesg`, switch logs |

Scenario presets: **init hang** → `NCCL_DEBUG_SUBSYS=INIT,BOOTSTRAP,NET` · **network problem** → `NET` · **topology question** → `GRAPH` · **which algo/protocol** → `TUNING` · **teardown issues** → `DESTROY`.
