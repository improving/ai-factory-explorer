---
id: RB-02
title: NCCL init hang, slow collective, wrong transport, mid-run hang
owner_layers: [L6, L4, L3, L1]
severity:
  default: SEV2
  escalate_to: "SEV1 when a production multi-node job hangs or runs at socket speed, or results are wrong"
signatures: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33]
guide_refs: ["§8", "§5 (tag matching)", "D (NCCL messages, IB messages)", "R3", "P (Job is hung, Job is slow, CUDA/NCCL init)"]
gist_refs: ["L6", "§9", "§11.1-§11.7", "L3", "L4", "L1"]
related:
  upstream: [RB-01, RB-03, RB-04]
  downstream: [RB-01, RB-03, RB-04]
  lookalike: [RB-09, RB-07]
gaps: [G01, G03, G04, G05]
---

# RB-02 — NCCL init hang, slow collective, wrong transport, mid-run hang

This runbook owns the **NCCL scenario forks** (init / intra-node / inter-node / slow / mid-run hang) and the **resource-limit checks** (`ulimit`, `/dev/shm`). It follows the NCCL playbook, CLI gist §11.

## 1. Trigger

| # | Signature (verbatim) | Decoder meaning |
|---|---|---|
| 12 | `ncclSystemError` / `ncclUnhandledCudaError` | External/system fault (network, driver, fabric). For `ncclUnhandledCudaError` read the preceding `Cuda failure XXX` line. Usually not an application bug. |
| 13 | `ncclInvalidArgument` / `ncclInvalidUsage` | Application misuse of the NCCL API, or an invalid environment variable. |
| 14 | `Call to connect failed` / `connect timeout` | Bootstrap TCP setup failed: wrong interface, firewall, DNS/hosts, or socket port range. |
| 15 | `NCCL INFO NET : Using interface lo:127.0.0.1` | NCCL picked `lo`/`docker0`/virbr instead of the real interface. |
| 16 | `Using network Socket` (when IB expected) | NCCL fell back to TCP because IB/RoCE was not found or disabled. Much lower bandwidth/higher latency. |
| 17 | `libnccl-net.so not found` | No external NCCL net plugin installed; built-in IB/Socket plugins are used. Often informational. |
| 18 | `ibv_reg_mr failed` / `ibv_create_qp failed` (also `Call to ibv_reg_mr failed`) | Locked-memory (`ulimit -l`) or fd limits too low, or HCA resource exhaustion. |
| 19 | `failed to extend /dev/shm/nccl-*` and `unlink shared memory /dev/shm/nccl-* failed` | `/dev/shm` too small (Docker defaults) or systemd removing IPC for "not logged in" users. |
| 20 | Crash during communicator init with stack limit `unlimited` | glibc shrinks NCCL helper-thread stacks to 2 MB when `ulimit -s` is `unlimited`. |
| 21 | MNNVL: `SIGSEGV in ncclCommInitRank` at `world_size >= 44` with `healthMask 0xaa` | Known NCCL bug at the 43→44 rank boundary; workaround `NCCL_MNNVL_ENABLE=0`. (`healthMask 0xaa` as a fabric symptom is RB-01.) |
| 22 | `NCCL_IGNORE_NET_MISMATCH` turns heterogeneous HCA misconfig into silent hang | Mismatched NIC counts across ranks ignored instead of failing. |
| 23 | `NCCL_CHUNK_SIZE` / `NCCL_P2P_NET_CHUNKSIZE >= 1MiB` → wrong results + `Xid 31` | Oversized chunk causes bad DMA / MMU fault. See Gaps (G03). |
| 24 | `GDAKI ... TRANSPORT_RETRY_EXC_ERR` | A retry-exception completion on a GDAKI QP was mis-handled and the device wait loop spins forever. |
| 25 | cuMem UDS fd exchange hang on single-node PCIe (no NVLink); `NCCL_CUMEM_ENABLE=0` isolates it | cuMem file-descriptor exchange stalls on a PCIe-only node. Applies to PCIe-only nodes only; HGX and NVL72 GPUs use NVLink. |
| 26 | `wrap_ibv_reg_mr_iova2(NULL, ...)` segment fault | Null function pointer into the IB verbs wrapper; verbs/GPUDirect RDMA path not available. |
| 27 | `ncclCommShrink` invalid `excludeRanksList` aborts parent communicator | Application passed an invalid exclude list. |
| 28 | Bootstrap `getenv()` SIGSEGV under glibc <2.41 | Known glibc/NCCL bootstrap interaction. |
| 29 | Job hangs mid-run / PyTorch NCCL watchdog timeout | A rank never entered the collective, a peer died, or the network/GPU failed mid-run. |
| 30 | Slow collective / low bus bandwidth | Wrong transport, degraded link, P2P disabled, bad affinity, or congestion. |
| 31 | Bare-metal PCIe P2P broken or slow while `topo -p2p` says OK (IOMMU/ACS) | IOMMU translated mode or PCIe ACS redirects P2P through the root complex. Applies to PCIe-only nodes; HGX and NVL72 GPUs use NVLink for P2P. |
| 32 | Tag matching offload confusion on CX7 IB with NCCL/OpenMPI | Knowledge gap; no command (G05). |
| 33 | MPI-side: hang at startup or segfault in `libmpi.so`; `PMIX ERROR: ... gds_ds12_lock_pthread.c`; `UCX WARN network device 'X' is not available`; `UCX ERROR no active messages transport ... Unsupported operation` | Open MPI/HPC-X chose the wrong interface or UCX transport. |

**Where each signature starts in section 5:**
Scenario A (init): 12, 14, 15, 18, 19, 20, 21, 25, 28, 33.
Scenario B (intra-node GPU path, PCIe-only nodes): 31.
Scenario C (inter-node path, GPUDirect RDMA): 16, 17, 22, 26.
Scenario D (slow): 30.
Scenario E (mid-run hang): 24, 29.
Application owner: 13, 27.
Signature 23 starts at decision step 1 (Xid 31 gate), then Mitigation A6.
Signature 32 has no command (G05).

## 2. Impact and blast radius

- **Severity:** SEV2 by default. SEV1 for a hung or wrong-result production job. SEV3 for a one-off slow run with a known cause.
- **Priority:** SEV2 is P3 in the P1 to P4 table of [shift-discipline.md](../handbook/shift-discipline.md#1-the-priority): one job is affected.
SEV2 is P2 when many nodes, a rail, or an NVL72 domain is affected (a node-level or fabric cause).
SEV1 is P1; SEV3 is P3.
- **Blast radius:** almost always **one job** (its ranks hang or run slow) — the fault is in the job's NCCL/MPI configuration or its resource limits. Node-level causes (`RemoveIPC`, `limits.conf`, IOMMU/ACS, port range) affect **every job on that node**; a misconfigured fabric or scheduler-wide interface setting can affect **a job class or the whole cluster's multi-node jobs**. Wrong results (signature 23) silently corrupt **one job's output**.

## 3. First 5 minutes

1. Read the log that the job already wrote (per-rank NCCL log, Slurm output file, or `kubectl logs <pod>` `[R]`) — expected: no `NCCL WARN` line; the intended interface; IB, not `Using network Socket`. Note the last line before the error or the hang.
2. `dmesg -T | grep -i xid` on every job node `[C:§9]` (or `journalctl -k` `[C:L8]`) — expected: no Xid in the last hour.
3. `ibstat` `[C:L4]` — expected: `Active`, `LinkUp`, expected rate and link layer.

Dashboards to open: the Grafana GPU dashboard (dcgm-exporter) for the job's nodes, and the job's per-rank step-time logs to spot the straggler or missing rank.

**Who runs it:** L1 runs steps 1, 2, 3 (read-only; [l1-primer.md](../handbook/l1-primer.md)). A re-run with `NCCL_DEBUG=INFO` `[E]` or `NCCL_RUN_DIAGNOSTICS=1` `[E]` (decision steps 7-8) is L2: the job owner agrees, and you use a test job, not the customer job.

## 4. Hardware variants

Row names follow [hardware-matrix.md](../handbook/hardware-matrix.md), Table 2.

| | Hopper HGX (H100/H200) | Blackwell HGX (B200/B300) | NVL72 rack (GB200/GB300) | AMD Instinct (MI300X/MI350X/MI355X) |
|---|---|---|---|---|
| Collective library and test | NCCL, `nccl-tests` | same | same, with multi-node NVLink | RCCL, `rccl-tests` (code in `ROCm/rocm-systems`); this runbook's NCCL env vars do not apply |
| Scale-up services the collectives need | Fabric Manager | Fabric Manager + NVLSM | Fabric Manager, NVLSM, IMEX across the compute trays (step 4 of the decision table is NVL72-only) | none found; ask supplier |
| Kubernetes operator and resource | NVIDIA GPU Operator, `nvidia.com/gpu` | same | same, plus the DRA driver with ComputeDomains | AMD GPU Operator, `amd.com/gpu` |
| Failure domain | 1 server, 8 GPUs | 1 server, 8 GPUs | up to 1 rack, 72 GPUs | 1 server, 8 GPUs |

## 5. Decision table

Gate first (rule: hardware before library), then the lowest-layer fabric checks, then NCCL itself.

| # | Layer | Command | Good looks like | Bad looks like | Next |
|---|---|---|---|---|---|
| 1 | L1 | `dmesg -T \| grep -i xid` on every job node `[C:§9]` | No Xid in the last hour | Any Xid | RB-03 (Xid 74/137/149: RB-01) |
| 2 | L2 | `nvidia-smi` on the job nodes `[C:L2]` | All GPUs present, not throttled | Missing or throttled GPU | RB-03 |
| 3 | L3 | `nvidia-smi topo -m` and `nvidia-smi nvlink -s` `[C:L3]` | NVLink paths as expected, links active | Missing NV# paths or inactive links (PCIe-only node: no NVLink; skip this step) | RB-01 (its FM restart, drain, or reboot is Repair A15 here) |
| 4 | L3 | NVL72 only: `nvidia-imex-ctl -H -N` `[C:§11.5]` | All nodes `READY` | `UNAVAILABLE`/`I`/`N`/`D`/`V` | RB-01 (Repair A15) |
| 5 | L4 | `ibstat` `[C:L4]` | `Active`, `LinkUp`, expected rate and link layer | Down/Polling/Disabled | RB-04 |
| 6 | L4 | `ib_write_bw -d <dev> -a` server / `ib_write_bw -d <dev> <host> -a` client `[C:§11.4]` | Near line rate | Low or failing | RB-04 (fabric owns this test) |
| 7 | L6 | `NCCL_RUN_DIAGNOSTICS=1 <app>` `[C:§11.1]` (L2: the job owner agrees; a test job; NCCL ≥ 2.31, see `NCCL_DEBUG=VERSION` `[C:§11.7]`) | `NCCL DIAG [OK]`; `[INFO]` lines are pointers, not verdicts | `only N/M peer accesses passed` (P2P fault), ranks >30% off median bandwidth | P2P: scenario B. Network: scenario C |
| 8 | L6 | `NCCL_DEBUG=WARN` (or `INFO`) rerun `[C:§11.2]` (L2: the job owner agrees; a test job) | n/a | `ncclSystemError`/`ncclUnhandledCudaError` = system fault; `ncclInvalidArgument`/`ncclInvalidUsage` = app bug | System fault: scenario A. App bug: fix the call/env var (signatures 13, 27). No error, the job is slow (signature 30): scenario D. The job hangs mid-run or the watchdog times out (signature 29): scenario E. GPUDirect RDMA not in use: scenario C, row C-5 |

**Who runs it:** L1 may run steps 1-5 (read-only). All other steps are L2 or L3.

### Scenario A — job hangs or fails during init (§11.2)

| # | Layer | Command | What it tells you |
|---|---|---|---|
| A-1 | L6 | `NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,BOOTSTRAP,NET` `[C:§11.2]` | Bootstrap failures, wrong interface, rank sync stalls |
| A-2 | L6 | `ip -br link \| grep LOWER_UP` `[C:§11.2]` | Which interfaces are really connected |
| A-3 | L6 | Wrong interface? `NCCL_SOCKET_IFNAME=<if>` `[E]` | NCCL grabbed `docker0` or a dead interface (signatures 14, 15) |
| A-4 | L6 | `mpirun -np <n> -N <ppn> hostname`, then build and run `cpi` (mpich example) `[C:§11.2]` | MPI itself is broken before NCCL starts |
| A-5 | L6 | `ulimit -l`, `ulimit -n` and `cat /proc/sys/fs/file-max`, `ulimit -s` `[C:§11.2]`. Read the limits inside the job, not in your login shell: `srun --jobid=<jobid> --overlap bash -c 'ulimit -l; ulimit -n; ulimit -s'` `[R]` (`--overlap` needs Slurm 20.11 or later) or `kubectl exec <pod> -- bash -c 'ulimit -l; ulimit -n; ulimit -s'` `[R]` | `ibv_reg_mr`/`ibv_create_qp` failures (memlock), failures at scale (fds; a 144-rank job can need >32K fds/process), stack must be `8192` (`unlimited` is the bug) |
| A-6 | L6 | `df -h /dev/shm` and `grep RemoveIPC /etc/systemd/logind.conf` `[C:§11.2]` | `/dev/shm` too small; `RemoveIPC=yes` deleting NCCL shm |
| A-7 | L6 | `NCCL_CUMEM_HOST_ENABLE=0` `[C:§11.2]` (`NCCL_CUMEM_ENABLE=0` `[E]` for the single-node PCIe UDS hang) | cuMem allocation issues (missing NUMA in container, driver <13.0 without P2P); NCCL ≥ 2.26.5 auto-falls back |
| A-8 | L6 | MPI-side: `OMPI_MCA_btl_tcp_if_include=<if>` (or `_if_exclude=lo,docker0,virbr0`; never both), `PMIX_MCA_gds=hash`, `UCX_NET_DEVICES=<dev>`, `UCX_TLS=self,sm,tcp`; last resort `OMPI_MCA_pml=^ucx OMPI_MCA_coll_hcoll_enable=0 OMPI_MCA_btl=self,tcp` `[C:§11.2]` | Fixes for signature 33 |

### Scenario B — intra-node GPU path suspect (§11.3)

| # | Layer | Command | What it tells you |
|---|---|---|---|
| B-1 | L1 | `cat /proc/cmdline` and `dmesg \| grep -iE 'iommu\|dmar'` `[C:§11.3]` | IOMMU in `Default domain type: Translated` breaks bare-metal PCIe P2P |
| B-2 | L1 | `lspci -vvv \| grep ACSCtl` (`SrcValid+` = ACS on) `[C:§11.3]` | ACS redirects P2P to the root complex (slow/hang) |
| B-3 | L3 | `nvidia-smi topo -p2p p` (PCIe; PCIe-only nodes) / `nvidia-smi topo -p2p n` (NVLink; HGX and NVL72) `[C:§11.3]` | All `OK` = healthy |
| B-4 | L3 | `simpleP2P` (cuda-samples) `[C:§11.3]` | Must end `Test passed`; catches transfers failing despite `topo -p2p` OK |
| B-5 | L3 | `nvbandwidth` `[C:§11.3]` | Measured GPU↔GPU bandwidth vs spec |
| B-6 | L4 | `lsmod \| grep nvidia_peermem` `[C:§11.3]` | GDRDMA module loaded (not needed with DMA-BUF kernels) |
| B-7 | L6 | `NCCL_P2P_DISABLE=1` / `NCCL_P2P_LEVEL=<n>` `[C:§11.3]` | A/B test whether the P2P transport is the problem |

### Scenario C — inter-node / fabric path (§11.4)

Follow RB-04 steps 3-13 for the raw fabric (ibstat, ib_write_bw, ib_write_lat, rdma statistic, mlxlink, ibping, rping, RoCE ethtool counters); RB-04 owns that procedure. NCCL-specific additions:

| # | Layer | Command | What it tells you |
|---|---|---|---|
| C-1 | L4 | `show_gids` → `NCCL_IB_GID_INDEX` `[C:§11.4]` | `ibv_modify_qp failed ... Invalid argument` on NCCL <2.21; on ≥2.21 do **not** set it; may need `NCCL_IB_TC` per fabric vendor |
| C-2 | L6 | `NCCL_IB_HCA=<list>` `[E]` | Pin NCCL to the right rail; exclude a flaky/storage NIC (signatures 16, 22) |
| C-3 | L6 | `NCCL_IB_DISABLE=1` `[E]` | Isolate the IB path from TCP |
| C-4 | L6 | Fix NCCL TCP port range with `net.ipv4.ip_local_port_range` (e.g. `50000 51000`) `[C:§11.4]`; read with `sysctl net.ipv4.ip_local_port_range` `[X:28]` | Firewall permits exactly that range |
| C-5 | L6 | GPUDirect RDMA in use (N5)? In the job's `NCCL_DEBUG=INFO` `[E]` log, the transport lines end in `via NET/IB/<n>/GDRDMA`. `nvidia-smi topo -m` `[C:L3]`: NIC to GPU is `PIX` or `PXB`. GDR kernel path: `lsmod \| grep nvidia_peermem` `[C:§11.3]` (B-6), or a DMA-BUF kernel. A/B test (L2, the job owner agrees, a test job): `NCCL_NET_GDR_LEVEL=<level>` `[E]`, `NCCL_DMABUF_ENABLE=1` `[E]` | No `/GDRDMA` in the transport lines: traffic goes through host memory. `SYS` or `NODE` between the NIC and its GPU: wrong NIC-GPU affinity, so NCCL does not use GDR; pin the rail with A2. No peer-memory module and no DMA-BUF: RB-05 (driver) |

### Scenario D — job runs but is slow (§11.5)

| # | Layer | Command | What it tells you |
|---|---|---|---|
| D-1 | L3 | `nvbandwidth` and `nvidia-smi topo -m` `[C:§11.5]` | Intra-node hardware ceiling |
| D-2 | L4 | `nvbandwidth -p multinode` (build with `cmake -DMULTINODE=1`) `[C:§11.5]` | Inter-node GPU bandwidth |
| D-3 | L6 | `NCCL_DEBUG=INFO all_reduce_perf -b 8 -e 8G -f 2 -g <gpus>` `[C:L6]`; across nodes `mpirun -np <n> -H <hosts> all_reduce_perf ...` `[C:L6]` | Acceptance-test number; bisect for a bad node pair |
| D-4 | L6 | `mpirun -n <n> nvloom -s pairwise --sizeMin 1M --sizeMax 4G` `[C:§11.5]` | Alternative benchmark including NVLink SHARP |
| D-5 | L6 | `NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,GRAPH,ENV` and grep `ncclTopoGetCpuAffinity` `[C:§11.5]`; `lscpu --extended=CPU,NODE,SOCKET,CORE` `[C:§11.5]` | Applied CPU affinity vs NUMA layout |
| D-6 | L6 | Tuning only after the above pass: `NCCL_MIN_CTAS`/`NCCL_MAX_CTAS`, `NCCL_BUFFSIZE`, `NCCL_CROSS_NIC`, `NCCL_IB_QPS_PER_CONNECTION>1`, `NCCL_ALGO`, `NCCL_PROTO` `[C:§11.5]`/`[E]` | NVIDIA discourages these in production; a win here can be a loss elsewhere |
| D-7 | L6 | Bisection to find the bad node or link (N3): the procedure below `[C:L6]` | The node or the link that makes the job slow |

**Bisection procedure (N3).** L2 runs it, with a test job on idle or drained nodes, never with the customer job.
The threshold is the bus bandwidth of the acceptance test for the same hardware type and node count (thresholds do not transfer between types; see [hardware-matrix.md](../handbook/hardware-matrix.md)).
A result below the threshold is a fail.
1. Per node: run `NCCL_DEBUG=INFO all_reduce_perf -b 8 -e 8G -f 2 -g <gpus>` `[C:L6]` on each node alone.
   A node that fails alone is bad: RB-03 (GPU) or RB-01 (NVLink).
2. Per pair: run `mpirun -np <n> -H <hosts> all_reduce_perf ...` `[C:L6]` on disjoint node pairs.
   A pair that fails contains the bad node or the bad link.
3. Halve: if no pair fails but the full node set is slow, split the node set into two halves and test each half.
   Keep the slow half and split it again, until the slow set has 2 nodes.
4. Name the bad node: test each node of the bad pair with a known-good node.
   The node that fails with two different good partners is the bad node.
   If both nodes pass with good partners, the link or the switch port between them is suspect: RB-04.
5. Every node and pair passes, but the full set fails: the cause is in the fabric (congestion, routing): RB-04.

### Scenario E — job hung mid-run (§11.6, cheat sheet "job is hung")

| # | Layer | Command | What it tells you |
|---|---|---|---|
| E-1 | L1/L2 | `dmesg -T \| grep -i xid`, `nvidia-smi` on every job node `[C:§9]` | Xid in the last hour; GPU still present (gate; RB-03) |
| E-2 | L4 | `iblinkinfo` + subnet-manager log for the node `[C:§9]` | Link flap in the last hour (RB-04) |
| E-3 | L6 | `py-spy dump --pid <pid>` on one rank `[C:L6]` | Blocked in NCCL, data read, or file write |
| E-4 | L6 | `ncclras` (and `-v`, `-t <sec>`, `-f json`, `-m`); without the binary: `echo verbose status \| nc localhost 28028` `[C:§11.6]` | Which rank never entered the collective; `MISMATCH` frozen across queries = stuck communicator; `INCOMPLETE`+`TIMEOUT` then `DEAD` with PID/node/GPU |
| E-5 | L6 | PyTorch Flight Recorder dump (`TORCH_NCCL_TRACE_BUFFER_SIZE` + dump) `[C:L6]`. The job owner sets at job start `TORCH_NCCL_TRACE_BUFFER_SIZE=2000` and `TORCH_NCCL_DUMP_ON_TIMEOUT=true` `[R]`. The dump goes to the path prefix in `TORCH_FR_DUMP_TEMP_FILE` `[R]` (default `/tmp/nccl_trace_rank_`; older PyTorch examples use `TORCH_NCCL_DEBUG_INFO_TEMP_FILE`). Analyse with `torchfrtrace <dump dir>` `[R]` | Per-rank collective calls; which rank never entered the collective |
| E-6 | L6 | GDAKI hang: `NCCL_GIN_TYPE=2` (PROXY) vs `=3` (GDAKI) A/B `[X:25]` | Isolates the GDAKI backend (signature 24) |

### Read-only diagnostics (by layer)

| Layer | Command | Tag | Look for |
|---|---|---|---|
| L1 | `dmesg -T`, `cat /proc/cmdline`, `lspci -vvv \| grep ACSCtl`, `lscpu --extended=CPU,NODE,SOCKET,CORE` | `[C:L1]`, `[C:§11.3]`, `[C:§11.5]` | Xid, IOMMU/ACS, NUMA layout |
| L2 | `nvidia-smi` | `[C:L2]` | GPUs present, clocks |
| L3 | `nvidia-smi topo -m`, `topo -p2p p/n`, `nvlink -s`, `nvidia-imex-ctl -H -N`, `nvidia-smi -q \| grep -v GUID \| grep -A4 Fabric` | `[C:L3]`, `[C:§11.3]`, `[C:§11.5]` | Topology, P2P, IMEX |
| L4 | `ibstat`, `ib_write_bw`, `ib_write_lat`, `rdma statistic`, `lsmod \| grep -E 'nvidia_peermem\|ib_core'`, `show_gids` | `[C:L4]`, `[C:§11.4]` | Fabric health |
| L6 | `NCCL_DEBUG*`, `NCCL_RUN_DIAGNOSTICS=1`, `ncclras`, `py-spy dump --pid`, `ulimit`, `df -h /dev/shm`, `ip -br link` | `[C:L6]`, `[C:§11.x]` | NCCL transport, limits, rank state |
| L6 | `NCCL_DEBUG_FILE=/path/nccl_%h_%p.log`, `NCCL_DEBUG_TIMESTAMP_FORMAT`, `NCCL_DEBUG_LEVELS` | `[C:§11.7]` | One log per process; timestamps to correlate with `dmesg` |
| L6 | `NCCL_DEBUG=VERSION` | `[C:§11.7]` | NCCL version for the known bugs (≥ 2.31 for diagnostics) |

Logging presets (§11.7): init hang → `NCCL_DEBUG_SUBSYS=INIT,BOOTSTRAP,NET` `[C:§11.7]`; network → `NET`; topology → `GRAPH`; algo/protocol → `TUNING`; teardown → `DESTROY`.

### Differential diagnosis

| Looks like | How to tell | Go to |
|---|---|---|
| NVLink/FM/IMEX fault | `Cuda failure 802/800/1`, `healthMask`, `cliqueId state 3`, NVLS errors | RB-01 |
| GPU hardware fault | Xid in `dmesg`; wrong results with Xid 31/48/95 | RB-03 |
| Raw fabric fault | `ib_write_bw` low or `perfquery -x` errors growing | RB-04 |
| Storage stall that looks like a hang | `py-spy dump` shows the rank in a file read/write | RB-07 |
| DPU datapath | Host NIC clean; fault on representors | RB-06 |
| Application bug | `ncclInvalidArgument`/`ncclInvalidUsage`, `ncclCommShrink` with bad list | Application owner |
| Toolchain/linker message | `nvlink fatal :` at build time | RB-09 |

## 6. Mitigation

Safety checklist (before any state-changing action, here and in Repair below):

```
- Drain the node / job queue first: `kubectl drain --ignore-daemonsets` or `scontrol update ... State=DRAIN Reason="<ticket>"`.
- On NVL72, verify no active IMEX/ComputeDomain job: `kubectl get computedomains,resourceclaims -A`.
- Restarting `nvidia-fabricmanager` kills every CUDA context on the NVSwitch system.
- BIOS/firmware/BMC changes require a change window; some need AC power cycle.
- Switch fabric changes (`ufm_ha_cluster failover`, `nv config apply`) can drop RoCE/IB sessions.
```

> Every action below needs a ticket ID as the reason (Slurm `Reason="<ticket>"`, or the change record).

Environment-variable rows are **runtime workarounds, not root-cause fixes**. Undo for each is "unset the variable and restart the job".

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A1 | Pin the NCCL socket interface `[E]` | `NCCL_SOCKET_IFNAME=<if>` | **L2.** The job owner agrees. `ip -br link \| grep LOWER_UP` | One job; bootstrap uses that interface | Unset |
| A2 | Pin HCAs `[E]` | `NCCL_IB_HCA=<list>` | **L2.** The job owner agrees. `ibstat` shows the right devices | One job; wrong list can disable IB | Unset |
| A3 | Isolate transports (owner of NCCL env workarounds; RB-01 A5-A7 repeat the fabric ones) `[E]`/`[C:§11.3]` | `NCCL_P2P_DISABLE=1`, `NCCL_IB_DISABLE=1`, `NCCL_NVLS_ENABLE=0`, `NCCL_MNNVL_ENABLE=0`, `NCCL_CUMEM_ENABLE=0` | **L2.** The job owner agrees. Evidence captured; one variable at a time | Slower collectives; diagnosis only. `NCCL_IB_DISABLE=1` drops the job to socket (TCP) speed | Unset |
| A4 | Pin the GIN backend `[X:25]` | `NCCL_GIN_TYPE=2` | **L2.** The job owner agrees. GDAKI hang confirmed | Uses PROXY; changes latency | Unset |
| A5 | Strict net mismatch check `[E]` | `NCCL_IGNORE_NET_MISMATCH=0` | **L2.** The job owner agrees. NCCL ≥ 2.30 (`NCCL_DEBUG=VERSION` `[C:§11.7]`). Heterogeneous HCA counts suspected | Job fails fast instead of hanging | Unset |
| A6 | Reduce chunk size `[E]` | `NCCL_P2P_NET_CHUNKSIZE=<bytes below 1 MiB>` (default 131072; the guide's chunk-size variable name is not in official docs, G03) | **L2.** The job owner agrees. Xid 31 plus wrong results with a large chunk | Throughput effect | Unset |

## 7. Repair

Remediation ladder: fix the resource limits (A7, A8, A9, A10) → fix the platform configuration (A11, A12, A13, A14) → restart / drain / reboot (A15, per RB-01 and RB-08) → RMA or vendor case via escalation.

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A7 | Raise memlock/fd limits `[C:§11.2]` | `* soft/hard memlock unlimited` in `limits.conf` (re-login or new Slurm job). Slurm: `slurmd` passes the limits of the submit host to the job (`PropagateResourceLimits` `[R]`); set `PropagateResourceLimitsExcept=MEMLOCK` `[R]` in `slurm.conf` so that the job gets the memlock limit of `slurmd`. Kubernetes pods: `limits.conf` does not apply; the pod gets the memlock limit of the container runtime: `LimitMEMLOCK=infinity` `[R]` in the systemd unit of the runtime, through the node image or the Rafay blueprint | **L2.** `ulimit -l` too low inside the job (Scenario A-5); change window. A runtime or `slurmd` restart needs a drain first | Per-user limits; system-level edit; change window | Revert `limits.conf`, the `slurm.conf` line, or the systemd unit |
| A8 | Fix stack limit `[C:§11.2]` | Set `ulimit -s` to `8192` in the job/launcher | **L2.** The job owner agrees. `ulimit -s` is `unlimited` inside the job (Scenario A-5) | Per-job | Restore previous setting |
| A9 | Fix `/dev/shm` `[C:§11.2]` | Docker `--shm-size=1g --ulimit memlock=-1`. Kubernetes pods: the Docker flags do not apply; mount an `emptyDir` volume with `medium: Memory` `[R]` at `/dev/shm` in the pod spec (memlock: A7) | **L2.** The job owner agrees. `df -h /dev/shm` small | Container or pod restart; memory-backed `emptyDir` counts against the memory limit of the pod | Restore previous container options or pod spec |
| A10 | Stop systemd removing shm `[C:prose-state]` | Set `RemoveIPC=no` in `/etc/systemd/logind.conf`, restart `systemd-logind` | **L2.** `grep RemoveIPC /etc/systemd/logind.conf` shows yes; change window | System-level; login sessions affected | Restore previous value and restart `systemd-logind` |
| A11 | Disable ACS / IOMMU for the GPU path `[C:prose-state]` | BIOS (VT-d off) or `setpci -s <bdf> ECAP_ACS+0x6.w=0000` per PLX bridge (PCIe-only nodes with PLX bridges; HGX and NVL72 GPUs use NVLink for P2P) | **L3.** Node drained (A15, RB-08); on NVL72 `kubectl get computedomains,resourceclaims -A` shows no live job; `lspci -vvv \| grep ACSCtl` shows `SrcValid+` and IOMMU translated; change window | System-level. The BIOS change needs a reboot. The `setpci` change does not survive a reboot: it must be re-applied after each reboot | Reverse the BIOS setting and reboot; reboot to undo `setpci` |
| A12 | Fix MPI interface `[C:§11.2]` | `OMPI_MCA_btl_tcp_if_include=<if>` (or `_if_exclude`), `UCX_NET_DEVICES=<dev>`, `UCX_TLS=self,sm,tcp` | **L2.** The job owner agrees. MPI hang/segfault diagnosed | One job | Unset |
| A13 | Pin NCCL TCP ports `[C:§11.4]` | Set `net.ipv4.ip_local_port_range` (e.g. `50000 51000`) via `sysctl -w` `[X:28]` | **L2.** Firewall blocks NCCL ports; change window | Node-wide ephemeral range | `sysctl -w net.ipv4.ip_local_port_range="<previous>"` |
| A14 | Toggle RAS profiler at runtime `[C:§11.6]` | `ncclras CONTROL PROFILER_MASK none` | **L2.** State change on a running job: the job owner agrees. NCCL ≥ 2.31 (`NCCL_DEBUG=VERSION` `[C:§11.7]`); record the previous mask first | Changes the running job, job-wide, no restart | `ncclras CONTROL PROFILER_MASK <previous>` |
| A15 | Restart FM / drain / reboot | See RB-01 A2/A4/A8 and RB-08 | **L2.** RB-01 gates | Per RB-01 | Per RB-01 |

## 8. Evidence to collect

Evidence to capture: NCCL logs per process (`NCCL_DEBUG_FILE=/path/nccl_%h_%p.log`), `ncclras -f json`, Flight Recorder dump, `py-spy dump --pid`, `dmesg -T` Xid lines, `ibstat`, `ib_write_bw` result, NCCL version.

## 9. Return to service

Verify the fix:
1. `NCCL_RUN_DIAGNOSTICS=1 <app>` prints `NCCL DIAG [OK]`.
2. `NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,BOOTSTRAP,NET` shows the intended interface and IB (not `Using network Socket`).
3. `NCCL_DEBUG=INFO all_reduce_perf -b 8 -e 8G -f 2 -g <gpus>` meets the acceptance threshold.
4. For a hang: `ncclras` shows no `MISMATCH` frozen across queries and no `DEAD` rank.

## 10. Escalation

- **Internal:** L1 hands over to L2 at the end of section 3 with no fix, at once for P1 and P2. L2 hands over to L3 when the runbook ends with no fix, or when the fix needs more than a standard change ([shift-discipline.md](../handbook/shift-discipline.md#4-the-escalation)).
- NVIDIA/NCCL (GitHub issue or support case) for: SIGSEGV in `ncclCommInitRank`, bootstrap `getenv()` crash, `wrap_ibv_reg_mr_iova2(NULL, ...)`, GDAKI hang, `ncclCommShrink` abort. Include NCCL version, `NCCL_DEBUG=INFO` log, topology (`nvidia-smi topo -m`), and the workaround that isolated it.
- Hand off to RB-01/RB-03/RB-04 per the decision table.
- Attach: per-process NCCL logs, `ncclras` JSON, `nvidia-bug-report.sh` if an Xid is present.

## 11. Customer message

> **SEV1/SEV2 template — NCCL hang / slow or wrong-result job:**
> "Your job <job-id> is hung (or running below expected performance / produced wrong results) due to a <collective-communication fault on <nodes> / a fabric issue under investigation>. Cause: <verified / not verified yet>. Current action: <fix / workaround> under ticket <ticket-id>. The job <will be restarted / will continue at reduced speed / results must be re-run>. Next update by <time: the update interval of the priority, see shift-discipline.md>."

## Appendix A — Gaps & open questions

- `[GAP:G01]` No package/version query (`ldd --version` for glibc is `[X:28]`, standard; NCCL package version comes from `NCCL_DEBUG=VERSION`).
- `[GAP:G03]` The guide's `NCCL_CHUNK_SIZE` is not in the official NCCL 2.32 environment-variable docs. This runbook uses `NCCL_P2P_NET_CHUNKSIZE`. Confirm the variable name with NVIDIA.
- `[GAP:G04]` No debugger/core-dump tooling in the sources for the segfault signatures (21, 26, 28); collect NCCL logs and the NCCL version instead.
- `[GAP:G05]` No command shows hardware tag-matching offload state (signature 32).
- Glibc <2.41 check uses `ldd --version` `[X:28]` (standard OS tool).
- Flight Recorder (E-5): the PyTorch tutorial documents `TORCH_FR_DUMP_TEMP_FILE` for the dump path; `TORCH_NCCL_DEBUG_INFO_TEMP_FILE` appears only in its example code.
  Check the variable name for the PyTorch version of the job.

## Appendix B — Source trace

| Step / claim | Guide section | Gist / external |
|---|---|---|
| Steps 1-2 gate | P (Job is hung 2, 4), R4 | §9 "job is hung" steps 2 and 4; L1, L2 |
| Steps 3-4 | R2, P (CUDA/NCCL init 2) | L3; §11.5 MNNVL |
| Steps 5-6 | P (init failure 5) | L4; §11.4 |
| Step 7 | §8 note on `NCCL_RUN_DIAGNOSTICS=1` | §11.1 |
| Step 8, Scenario A | §8, D (NCCL messages), R3 | §11.2 |
| Scenario B | §8 (cuMem UDS, P2P) | §11.3 |
| Scenario C | D (IB messages) | §11.4 |
| Scenario D | P (Job is slow) | §11.5, §9 "job is slow" |
| Scenario E | P (Job is hung) | §11.6, §9 "job is hung" |
| Bisection procedure (D-7) | runbook catalogue N3 | L6 `all_reduce_perf`, "Bisection search for a defective node pair" |
| C-5 GPUDirect RDMA | runbook catalogue N5; D (`DMA-BUF not supported`) | L3 `topo -m`, §11.3 `nvidia_peermem`; NCCL env docs |
| E-5 Flight Recorder variables, `torchfrtrace` | P (Job is hung 3) | L6; PyTorch Flight Recorder tutorial |
| A7/A9 Kubernetes and Slurm variants | §8 | Kubernetes `emptyDir`; systemd.exec `LimitMEMLOCK`; slurm.conf `PropagateResourceLimits` |
| A1-A14 | §8 (state-changing fixes) | `[E]`, §11.2-§11.6, X25, X28 |
