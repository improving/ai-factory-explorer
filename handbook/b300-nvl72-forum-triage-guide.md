# B300 / NVL72 / GB300 Forum-Derived SRE Triage Guide

> Generated from a survey of NVIDIA Developer Forums (DGX Station/GB300/GB200, CUDA, GPU-Accelerated Libraries, Base Command Manager, DOCA, BlueField, Switches/Gateways), the NVIDIA/nccl GitHub issue tracker, and the Dell PowerEdge Wiki.
> Command recommendations use the local CLI reference framework (L1–L8 layers) as the source of truth.
>
> The nine runbooks RB-01 to RB-09 in [runbooks/](../runbooks/README.md) turn these signatures into step-by-step procedures; start there on shift.

## Summary table

| Rank | Issue category | Frequency | First command to run |
|------|----------------|-----------|----------------------|
| 1 | NVLink/NVSwitch / Fabric Manager / IMEX / NVLSM failure | Very high on B300/GB200/NVL72 | `systemctl status nvidia-fabricmanager` + `journalctl -u nvidia-fabricmanager` (L3) |
| 2 | NCCL init hang / slow collective / wrong transport | Very high in distributed jobs | `NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,BOOTSTRAP,NET <app>` (L6) |
| 3 | GPU ECC / Xid / thermal / power (incl. silent wrong results from cuBLASLt/cuDSS/nvCOMP) | High | `dmesg -T | grep -iE 'xid|aer'` → `nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE` (L1/L2) |
| 4 | InfiniBand/RoCE link down, slow, or flaky | High on Q3400-RA / CX8 / NVL72 fabrics | `ibstat` (L4) |
| 5 | Firmware / driver / BMC / BIOS / DPU boot | High during bring-up and upgrades | `ipmitool sel list` + `dmesg -T | grep -iE 'dpc|pcie|mlx5|nvlink'` (L1/L2/L4) |

## Detailed findings per forum link

### 1. DGX Station / GB300 / GB200 — https://forums.developer.nvidia.com/c/accelerated-computing/dgx-station-gb300-gb200/750

- **Category:** Mixed: power/resource-group policy, memory sizing, network mode questions, inference performance.
- **Error signatures:**
  - DPS 0.9.0 on DGX_B300: `policy capability max cannot be more than active psu policy limit max`
  - GB300 NVL72 certification: 2× RAM-to-VRAM ratio confusion
  - ConnectX-8 SuperNIC mode questions (IB vs Ethernet)
  - DGX Station local NVMe space / 1T LLM model sizing at FP4
- **Layer(s):** L1 (hardware/BMC/power), L2 (GPU), L4 (network), L7 (platform sizing).
- **Read-only diagnostics:**
  1. `ipmitool sensor` / `ipmitool sel list` (L1) — verify PSU policy, power budget, thermal sensors.
  2. `nvidia-smi -q` (L2) — GPU presence, temp, power cap, ECC state.
  3. `lstopo` + `lspci -tv` (L1) — confirm NIC/GPU PCIe placement and NUMA affinity.
- **State-changing fixes mentioned (if any):**
  - DPS resource-group activation failure likely needs a BMC/firmware update or power-policy reconfiguration (change-window).
- **Notes / caveats:**
  - Many posts are pre-shipping / sizing questions, not concrete failures.  The DPS policy error is the most actionable B300-specific signature.

---

### 2. CUDA — https://forums.developer.nvidia.com/c/accelerated-computing/cuda/206

- **Category:** Driver/kernel/CUDA toolkit issues, compiler/linker errors, DCGM power warnings, DMA-BUF, half-precision math correctness.
- **Error signatures:**
  - `DCGM 4.7.0 reports Power Health Warning on one L40S`
  - `nvlink fatal : Could not open input file '/usr/lib/x86_64-linux-gnu/librt.a'` (CUDA linker, *not* NVLink fabric)
  - `DMA-BUF not supported on RTX 5090 with open kernel module`
  - `crt/host_config.h: No such file or directory` (CUDA 13.0 on GitHub Actions windows-2025)
  - `cicc dies with SIGILL lowering __nvvm_atom_add_gen_d for sm_120`
  - Half-precision intrinsics returning wrong results for subnormal/constant-folded inputs (`__sincosf`, `__sinf`, `__tanf`, `htanh`, `hexp`, `hatan`)
- **Layer(s):** L1 (OS/toolchain), L2 (GPU/driver).
- **Read-only diagnostics:**
  1. `nvidia-smi` (L2) — driver version, GPU state.
  2. `dcgmi health -c` (L2) — confirm DCGM power/health verdict.
  3. `dmesg -T | grep -iE 'nvidia|dcgm|thermal|power'` (L1) — correlate with kernel events.
- **State-changing fixes mentioned (if any):**
  - `nvidia-smi -pl <watts>` for thermal mitigation only; record and remove after.
  - CUDA linker errors often require installing `libc6-dev` / `librt.a` or using a different toolchain image.
- **Notes / caveats:**
  - Several CUDA posts are precision/correctness bugs rather than operational alerts.  In production, the DCGM power-health mismatch is the most SRE-relevant.

---

### 3. GPU-Accelerated Libraries — https://forums.developer.nvidia.com/c/accelerated-computing/gpu-accelerated-libraries/12

- **Category:** Silent wrong results, hangs, NaNs, decompression failures (cuBLASLt, cuDSS, nvCOMP, cuSolver, cuRANDDx).
- **Error signatures:**
  - cuBLASLt: silently wrong FP16/BF16/FP8 GEMM under `CUDA_MPS_ACTIVE_THREAD_PERCENTAGE` with `algoId 66` cluster kernels
  - cuDSS: `UBATCH_SIZE > ~160` → NaN solutions depending on unrelated device memory
  - nvCOMP: `nvcompBatchedZstdDecompressAsync never returns on corrupted zstd frame`
  - nvCOMP ANS FLOAT8_E4M3: single-byte decompression leaves `device_statuses` unchanged
  - cuDSS / cuSolver: API shape/lda/n questions
  - CUDA 13.2 double-precision math bugs on `sm_80`
- **Layer(s):** L2 (driver/MPS), L6 (application/library).
- **Read-only diagnostics:**
  1. `nvidia-smi -q -d PERFORMANCE,ECC` (L2) — check throttling/ECC before blaming the library.
  2. `dcgmi diag -r 1` (L2) — quick GPU health check.
  3. Repro with `CUDA_MPS_ACTIVE_THREAD_PERCENTAGE=100` or MPS disabled (L6) to isolate MPS-specific correctness bugs.
- **State-changing fixes mentioned (if any):**
  - Disable MPS or force 100% thread percentage for affected GEMMs (workload change).
  - Reduce cuDSS `UBATCH_SIZE` to ≤160.
- **Notes / caveats:**
  - These are application-layer correctness issues, but they can masquerade as hardware (ECC/thermal) problems.  Always rule out GPU health first.

---

### 4. Base Command Manager — https://forums.developer.nvidia.com/c/accelerated-computing/base-command-manager/596

- **Category:** Cluster lifecycle / Slurm integration / Kubernetes networking / firmware / CVEs.
- **Error signatures:**
  - `Problems Integrating BCM to an existing cluster` (Slurm already present)
  - Adding nodes to Slurm job queue → `sinfo`/`squeue` nodelist empty
  - BCM 11 CVE-2025-62878: `Local Path Provisioner updated to v0.0.34`
  - NMC 2.0 vs 1.1: `SR-IOV NetworkNodePolicy` step difference for DGX B200/BasePOD
  - ConnectX-5 Ex: `PCIe Gen4 equalization completes but speed change to 16GT/s never asserted` — link stays at 8GT/s
- **Layer(s):** L7 (platform), L1 (PCIe/firmware).
- **Read-only diagnostics:**
  1. `sinfo -R` + `scontrol show node <node>` (L7) — Slurm node state, GRES, reason.
  2. `squeue` + `sacct -j <job>` (L7) — why a job is pending or failed.
  3. `lspci -tv` + `lspci -vvv | grep LnkSta` (L1) — verify PCIe negotiated speed.
- **State-changing fixes mentioned (if any):**
  - `scontrol update ... State=DRAIN Reason="<ticket>"` / `State=RESUME` (L7) — drain before repair; always include ticket reason.
  - `kubectl cordon` / `kubectl drain --ignore-daemonsets` (L7) — on NVL72 one drain can stop a 72-GPU job; check ComputeDomain first.
  - BCM CVE/local-path-provisioner update requires a change window.
- **Notes / caveats:**
  - BCM issues are mostly platform/configuration.  The ConnectX-5 Ex PCIe equalization failure is a hardware/firmware edge case that looks like a software misconfig.

---

### 5. DOCA — https://forums.developer.nvidia.com/c/infrastructure/doca/370

- **Category:** DOCA/OFED/DPU software regression, kernel build failures, SSL/repo issues, network/storage offloads.
- **Error signatures:**
  - DOCA 3.4→3.5 regression: `kernel oops with rcprdma` on ConnectX-5/ConnectX-6 (CX4 unaffected)
  - `Network performance causing GPU idle time`
  - DOCA-OFED 3.4.0 repository `SSL Handshake Failure on Debian 13 (Trixie)`
  - DOCA 3.5.0 DKMS installer fails to build on `RHEL 9.8 kernel 5.14.0-687.25.1`
  - `gdscheck` result shows `NVMe P2PDMA unsupport`
  - Tag matching offload confusion on CX7 IB with NCCL/OpenMPI
  - Switchless ring host chaining with `MCX755106AC-HEAT`
- **Layer(s):** L1 (kernel/DKMS), L4 (network/RDMA), L5 (storage P2P).
- **Read-only diagnostics:**
  1. `uname -r` + `dkms status` (L1) — kernel/DKMS state.
  2. `ibstat` + `rdma statistic` (L4) — RDMA transport counters.
  3. `ib_write_bw -d <dev> -a` / `ib_write_lat` (L4) — separate fabric from NCCL.
- **State-changing fixes mentioned (if any):**
  - Downgrade DOCA/OFED to a known-good version (change window; affects all RDMA traffic).
  - `modprobe ib_umad` to allow Fabric Manager start on B200/B300.
- **Notes / caveats:**
  - The `rcprdma` oops is a classic "new DOCA release breaks existing NFS-over-RDMA" regression.  Rollback and open a support case before trying workarounds.

---

### 6. BlueField — https://forums.developer.nvidia.com/c/infrastructure/bluefield/511

- **Category:** DPU boot/firmware, eSwitch/OVS datapath, IPsec, mixed port types, host-hotplug.
- **Error signatures:**
  - GB300 compute tray boot: `Synchronous exception at 0x0000000000000`
  - BlueField-3 boot hang: `Exiting boot services...` / UEFI `GET P-S:fail(14)`
  - BF3 firmware update hang: `eMMC probed` then no output; only `UP_TIME` increments
  - BF3 mixed port link type (IB + Ethernet) confusion
  - HBN 3.2.2 L3 EVPN VXLAN: `TX packets massively dropped despite correct control-plane state`
  - BF3 TLP emulation stays disabled after reset (DOCA 3.5 / FW 32.50.1002)
  - Out-of-order DPU packets through default OVS bridge
  - ConnectX-7 NICs disappear after DGX Spark system update: `cx7-pcie-hotplug driver issue`
  - BF3 DPU mode: `eSwitch never delivers vport traffic to representors`
  - `mlx5_core ... wait_fw_init:316: Waiting for FW initialization, timeout abort` → `mlx5_load_one failed with error code -16`
- **Layer(s):** L1 (boot/UEFI/firmware), L4 (DPU network datapath).
- **Read-only diagnostics:**
  1. `cat /dev/rshim0/misc` (L1) — DPU boot status, `UP_TIME`, `SW_RESET`.
  2. `dmesg -T | grep -iE 'mlx5_core|rshim|bluefield|fw init'` (L1) — firmware init errors.
  3. `nv show interface` / `ethtool -S <rep>` (L4) — representor counters and drops.
- **State-changing fixes mentioned (if any):**
  - `SW_RESET 1` via rshim to restart DPU boot cycle (safe in isolation; may drop DPU-hosted network functions).
  - Reinstall BFB / DPU firmware update (change window).
  - `mlxconfig` changes to `INTERNAL_CPU_MODEL`, `LINK_TYPE_P*`, TLP emulation (requires reboot/power cycle).
- **Notes / caveats:**
  - BF3 boot hangs are frequently firmware/BMC-credential or rshim-related.  Collect rshim console and UEFI logs before re-flashing.

---

### 7. Switches and Gateways — https://forums.developer.nvidia.com/c/infrastructure/switches-and-gateways/523

- **Category:** IB switch/OpenSM configuration, Q3400-RA/NVOS behavior, PRBS/telemetry, port splitting, switch-to-switch connectivity.
- **Error signatures:**
  - Q3400-RA: `Duplicated LID forCA GUID` in OpenSM log
  - Q3400-RA: `hm_ports_health_policy_file` option does not work
  - Q3400-RA: `iblinkinfo -S GUID` does not work
  - Q3400-RA: `gNMI per-channel PHY telemetry mismatch` vs PPCNT
  - Q3400-RA: `mlxlink` PRBS test does not work
  - CX8 C8180: port split to Config-7 creates Ethernet port instead of IB
  - QM9700/MLNX-OS upgrade path questions
  - QM9700 ↔ SB7800 connectivity (NDR vs EDR signaling)
  - NVSwitch on H200 passthrough in ESXi
- **Layer(s):** L4 (network fabric).
- **Read-only diagnostics:**
  1. `iblinkinfo` + `ibnetdiscover` (L4) — fabric topology and link state.
  2. `perfquery -x <lid>` (L4) — symbol errors, link-downed counters.
  3. `mlxlink -d <mst_dev> -p <port> --cable` (L4) — BER, optical power, FEC.
- **State-changing fixes mentioned (if any):**
  - OpenSM / `prism_an_lmc` reconfiguration (change window; can briefly re-route fabric).
  - `nv action clear interface <swp> counters` / PHY info reset on NVOS (state-changing).
  - Switch firmware upgrade (change window).
- **Notes / caveats:**
  - Q3400-RA on NVOS is **not** MLNX-OS: many classic IB SM commands are unsupported or behave differently.  UFM or a dedicated OpenSM server is required for IB SM functions.

---

### 8. NVIDIA/nccl GitHub Issues — https://github.com/NVIDIA/nccl/issues

- **Category:** NCCL correctness, init hangs, MNNVL/NVLS, performance regressions, crashes with invalid arguments.
- **Error signatures:**
  - `ncclSystemError` / `ncclUnhandledCudaError` / `ncclInvalidArgument` / `ncclInvalidUsage`
  - `transport/nvls.cc:... NCCL WARN Cuda failure 1 'invalid argument'`
  - `Cuda failure 802 'system not yet initialized'` (Fabric Manager not loaded)
  - `Cuda failure 800 'operation not permitted'` (IMEX channel permissions)
  - MNNVL: `SIGSEGV in ncclCommInitRank` at `world_size >= 44` with `healthMask 0xaa`
  - `NCCL_IGNORE_NET_MISMATCH` turns heterogeneous HCA misconfig into silent hang
  - `NCCL_CHUNK_SIZE` / `NCCL_P2P_NET_CHUNKSIZE >= 1MiB` → wrong results + `Xid 31`
  - `GDAKI` backend: `TRANSPORT_RETRY_EXC_ERR` completion hangs device forever
  - cuMem UDS fd exchange hang on single-node PCIe (no NVLink); `NCCL_CUMEM_ENABLE=0` isolates it
  - `wrap_ibv_reg_mr_iova2(NULL, ...)` segment fault
  - `ncclCommShrink` invalid `excludeRanksList` aborts parent communicator
  - Bootstrap `getenv()` SIGSEGV under glibc <2.41
- **Layer(s):** L3 (NVLink/NVSwitch/NVLS), L4 (IB/RoCE), L6 (NCCL/app).
- **Read-only diagnostics:**
  1. `NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,BOOTSTRAP,NET <app>` (L6) — bootstrap, interface selection, transport negotiation.
  2. `nvidia-smi topo -m` + `nvidia-smi nvlink -s` (L3) — intra-node topology and NVLink errors.
  3. `ibstat` + `ib_write_bw -d <dev> -a` (L4) — verify fabric before blaming NCCL.
- **State-changing fixes mentioned (if any):**
  - Runtime workarounds (not root-cause fixes): `NCCL_NVLS_ENABLE=0`, `NCCL_MNNVL_ENABLE=0`, `NCCL_CUMEM_ENABLE=0`, `NCCL_P2P_DISABLE=1`, `NCCL_IB_HCA=...`, `NCCL_SOCKET_IFNAME=...`.
  - `systemctl restart nvidia-fabricmanager` (kills all CUDA contexts on NVSwitch systems; drain first).
  - `nvidia-modprobe -s -i <start:number of minors>` to create IMEX channels (deprecated/removed in newer releases; use package-provided udev rules).
- **Notes / caveats:**
  - `healthMask 0xaa` = 4 of 8 NVLink fabric paths flagged degraded.  The 43→44 rank SIGSEGV is a known NCCL bug with workaround `NCCL_MNNVL_ENABLE=0`.
  - `NCCL_RUN_DIAGNOSTICS=1` (≥2.31) should be run first on any init failure; it performs P2P and net bandwidth checks automatically.

---

### 9. Dell PowerEdge Wiki — https://www.dell.com/community/en/topics/PowerEdge-Wiki

- **Category:** Wiki index / no accessible posts.
- **Error signatures:** N/A — page returned only a banner and required sign-in; no PowerEdge/HGX-specific error signatures were extractable.
- **Layer(s):** N/A.
- **Read-only diagnostics:**
  1. `racadm techsupreport collect` + `export` (L1) — Dell SupportAssist evidence bundle for an RMA case.
  2. `ipmitool sensor` / `ipmitool sel list` (L1) — BMC sensors/events.
  3. `lspci -tv` (L1) — PCIe tree of GPU/HCA/NVMe on PowerEdge/HGX chassis.
- **State-changing fixes mentioned (if any):** None found in accessible content.
- **Notes / caveats:**
  - This source could not be mined because the wiki index is empty or behind login.  For PowerEdge/HGX issues, use Dell SupportAssist, iDRAC logs, and the same L1-L8 stack.

## Error signature decoder: what the common messages mean

This section translates the most common signatures found in the forums into what they actually tell you.

### GPU Xid codes (NVIDIA driver error events)

| Xid | What it means | What to do next |
|-----|---------------|-----------------|
| **48** | Uncorrectable double-bit error (DBE) in GPU framebuffer memory. | Check `nvidia-smi -q -d ECC` for growing uncorrectable counters; if persistent, RMA candidate. |
| **63** | Row remapper marked a new row for remapping; a GPU reset is needed to activate it. | Run `nvidia-smi -q -d ROW_REMAPPER` after reset; repeated growth means failing memory. |
| **64** | Row remapper event (row remap state changed). | Same as Xid 63: monitor aggregate row remap count. |
| **94** | "Contained ECC error" — the driver caught and contained the error without killing the context. | Often follows an NVLink parity error (Xid 137). May *not* increment ECC counters. |
| **95** | "Uncontained ECC error" — more serious; context may be killed. | Treat like Xid 48/94 but more urgent; collect `nvidia-bug-report.sh`. |
| **31** | GPU MMU fault — bad virtual/physical address or malformed DMA. | Check `dmesg` for preceding NCCL/library messages; suspect chunk-size/buffer bugs if NCCL is involved. |
| **137** | NVLink TLC RX PRIV error — transport-layer parity/privilege fault on an NVLink receiver. | Can cascade into Xid 94 across multiple GPUs; inspect `nvidia-smi nvlink -s` for error counters. |
| **171** | GDDR uncorrectable DRAM error in a specific FBPA/subpartition. | Similar to Xid 48; pinpoints memory partition. |
| **74 / 149** | NVLink errors. | `nvidia-smi nvlink -s` / `nvidia-smi nvlink -e` to see which link is failing. |
| **79** | GPU "fell off the bus" — PCIe link/train error. | `lspci -tv`, `dmesg -T | grep -iE 'aer|pcie|nvrm'`, reseat or replace. |

### CUDA / driver status codes

| Message | Meaning |
|---------|---------|
| `Cuda failure 802 'system not yet initialized'` | The GPU driver says the NVSwitch/NVLink fabric is not ready. Almost always means Fabric Manager / NVLSM is not loaded or not finished initializing. |
| `Cuda failure 800 'operation not permitted'` | Permission denied for a fabric/IMEX handle. On MNNVL systems check write access to `/dev/nvidia-caps-imex-channels/channel*`. |
| `Cuda failure 1 'invalid argument'` | Generic invalid argument. In the NVLS path it usually means NVLink multicast memory could not be allocated — often because FM/NVLS is unhealthy. |
| `NV_ERR_FABRIC_MANAGER_NOT_PRESENT` | Kernel tried to use the NVLink fabric but Fabric Manager is not present. Same root cause as failure 802. |
| `Detected Pre-NVL5 system` | Fabric Manager startup message when it does not see the expected NVSwitch devices. Usually wrong FM/driver package, missing switch tray, or missing `ib_umad`/`nvlsm`. |
| `DMA-BUF not supported` | Open-kernel-module limitation on some GPUs; GDRDMA paths may need DMA-BUF support or a proprietary driver. |

### NCCL messages

| Message | Meaning |
|---------|---------|
| `ncclSystemError` | External/system fault (network, driver, fabric). Usually *not* an application bug. |
| `ncclUnhandledCudaError` | A CUDA API call failed inside NCCL. Read the preceding `Cuda failure XXX` line. |
| `ncclInvalidArgument` / `ncclInvalidUsage` | Application-level misuse of NCCL API or invalid environment variable. |
| `Call to connect failed` / `connect timeout` | Bootstrap TCP setup failed. Wrong interface, firewall, DNS/hosts, or socket port range. |
| `Using network Socket` | NCCL fell back to plain TCP sockets because IB/RoCE was not found or disabled. Expect much lower bandwidth/higher latency. |
| `libnccl-net.so not found` | No external NCCL net plugin installed; NCCL uses built-in IB/Socket plugins only. |
| `healthMask 0xaa` | MNNVL fabric health bitmask: `0xaa = 0b10101010` means 4 of 8 NVLink fabric paths are flagged degraded. |
| `cliqueId <id> state 3` | MNNVL clique is in a non-healthy state; check `nvidia-imex-ctl -H -N` and Fabric Manager logs. |
| `transport/nvls.cc:... Cuda failure ...` | NVLink SHARP (NVLS) initialization failed. Verify Fabric Manager and `nvidia-smi nvlink` health. |
| `GDAKI ... TRANSPORT_RETRY_EXC_ERR` | A retry-exception completion on a GDAKI QP was mis-handled and the device-side wait loop spins forever. Workaround often requires disabling GDAKI or the offending transport. |

### InfiniBand / RoCE / network messages

| Message | Meaning |
|---------|---------|
| `ibv_reg_mr failed` | Failed to register host memory with IB verbs. Most common cause: `ulimit -l` (locked memory) too low. |
| `ibv_create_qp failed` | Failed to create an IB queue pair. Locked-memory or file-descriptor limits, or HCA resource exhaustion. |
| `Duplicated LID` in OpenSM | Two ports were assigned the same LID. Fabric misconfiguration; review `prism_an_lmc`, `lmc`, and `lids_per_rtr`. |
| `wait_fw_init: ... timeout` | Mellanox/BF firmware failed to finish initializing. Corrupt/incompatible firmware, power issue, or bad BFB. |
| `mlx5_load_one failed with error code -16` | Firmware init failed (`-EBUSY`); common after DPU/ConnectX firmware updates or bad power events. |
| `Port ... Active/ LinkUp` (from `ibstat`) | Healthy IB state. If you see `Polling`, `Disabled`, or `LinkDown`, check cable/transceiver/FEC. |
| PFC / ECN / CNP counters growing (`ethtool -S`) | RoCE congestion signals. PFC storms or ECN marking indicate lossless fabric misconfiguration or incast. |

### BlueField / DPU messages

| Message | Meaning |
|---------|---------|
| `Synchronous exception at 0x0000000000000` | Early-boot CPU fault (null pointer). Usually UEFI/firmware/DPU-BMC credential or secure-boot issue. |
| `GET P-S:fail(14)` | UEFI could not get credentials/state from the DPU BMC. Check DPU BMC firmware and lifecycle state. |
| `eMMC probed` then boot stalls | BFB/OS install hang; BFB/firmware/rshim incompatibility or power issue. |
| `OUT_OF_ORDER` / out-of-order packets through OVS bridge | DPU OVS reordering; may need flow offloads, queue config, or a different OVS/DOCA version. |

### Platform / power / policy messages

| Message | Meaning |
|---------|---------|
| `policy capability max cannot be more than active psu policy limit max` | DPS resource-group power policy conflicts with the active BMC PSU policy on DGX_B300. Firmware/DPS/BMC version alignment issue. |
| `sinfo -R` shows no nodes in queue / empty nodelist | BCM/Slurm WLM queue assignment misconfiguration; nodes are not mapped to the intended job queue. |

## Top recurring root causes

1. **Fabric Manager / NVLSM not ready or mismatched with driver**
   - Signature: `Cuda failure 802 'system not yet initialized'`, `NV_ERR_FABRIC_MANAGER_NOT_PRESENT`, `Detected Pre-NVL5 system`.
   - Why: On B300/GB200/NVL72, `nvidia-fabricmanager` now depends on `nvlsm` and `ib_umad`.  Missing packages or driver/FM version skew break CUDA init.
   - Start with: `systemctl status nvidia-fabricmanager`, `journalctl -u nvidia-fabricmanager`, confirm `nvlsm` is installed and `ib_umad` loaded.

2. **MNNVL fabric degradation / IMEX permissions**
   - Signature: `healthMask 0xaa`, MNNVL SIGSEGV at scale, `Cuda failure 800 'operation not permitted'`.
   - Why: Multi-node NVLink requires IMEX channels and matching `cliqueId`/state across nodes.  Degraded fabric paths or missing `/dev/nvidia-caps-imex-channels/channel*` write access cause init crashes or permission errors.
   - Start with: `nvidia-imex-ctl -H -N`, `nvidia-smi -q | grep -A4 Fabric`, `ls -l /dev/nvidia-caps-imex-channels/channel*`.

3. **Wrong network interface / transport selected by NCCL/MPI**
   - Signature: `NCCL INFO NET : Using interface lo:127.0.0.1`, `Call to connect failed`, `ibv_reg_mr failed`, `Using network Socket` when IB expected.
   - Why: Docker/virbr/docker0 interfaces, `lo`, or mismatched `NCCL_IB_HCA` / `NCCL_SOCKET_IFNAME` cause bootstrap hangs or fallback to slow socket transport.
   - Start with: `NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,BOOTSTRAP,NET`, `ip -br link | grep LOWER_UP`, verify `ulimit -l/-n/-s`.

4. **PCIe / NVLink physical-layer issues**
   - Signature: ConnectX-5 Ex stays at 8GT/s, CX7 disappears after hotplug, `Xid 137` (NVLink TLC RX PRIV) cascade, `Xid 31` GPU MMU faults.
   - Why: DPC (Downstream Port Containment) events on CX8 hotplug, PCIe equalization failures, or degraded NVLink cables/switches.
   - Start with: `lspci -tv`, `dmesg -T | grep -iE 'pcie|aer|dpc|nvlink|xid'`, `nvidia-smi nvlink -s`, `mlxlink`.

5. **Library-level silent wrong results and hangs under MPS or large batch sizes**
   - Signature: cuBLASLt `algoId 66` wrong results under `CUDA_MPS_ACTIVE_THREAD_PERCENTAGE`, cuDSS NaN at `UBATCH_SIZE > 160`, nvCOMP hang on corrupted frames.
   - Why: MPS partitioning interacts badly with cluster kernels; library buffer sizing assumptions break at edge-case dimensions.
   - Start with: `nvidia-smi -q -d PERFORMANCE,ECC`, repro without MPS or with reduced batch size, isolate to a single rank.

## Recommended quick-start playbook

### Job is slow

1. `nvidia-smi` on a job node — all GPUs present? Any throttled/low-clock? (L2)
2. Per-rank step time from logs — one straggler or all slow? (L6)
3. `perfquery -x` + `iblinkinfo` on the slow rank's nodes — symbol errors, link down, speed. (L4)
4. `NCCL_DEBUG=INFO all_reduce_perf -b 8 -e 8G -f 2 -g <gpus>` vs. acceptance threshold. (L6/L4)
5. If storage-bound: `nfsstat -m` → `fio` / `iostat -x` → `vastpy-cli --json get clusters`. (L5)

### Job is hung

1. `py-spy dump --pid <pid>` on one rank — blocked in NCCL? data read? file write? (L6)
2. `dmesg -T | grep -i xid` on every job node — Xid in the last hour? (L1/L2)
3. PyTorch Flight Recorder dump or `ncclras -f json` — which rank never entered the collective? (L6)
4. `nvidia-smi` on that rank's node — GPU still present? (L2)
5. `iblinkinfo` + subnet-manager log for that node — link flap in the last hour? (L4)

### CUDA / NCCL init failure on B300/GB200/NVL72

1. `systemctl status nvidia-fabricmanager` + `journalctl -u nvidia-fabricmanager` (L3)
2. `nvidia-smi -q | grep -A4 Fabric` + `nvidia-imex-ctl -H -N` (L3)
3. `ls -l /dev/nvidia-caps-imex-channels/channel*` (L3)
4. Re-run with `NCCL_DEBUG=INFO NCCL_DEBUG_SUBSYS=INIT,BOOTSTRAP,NET` (L6)
5. `ibstat` + `ib_write_bw` to verify fabric. (L4)

### GPU health / ECC / Xid

1. `dmesg -T | grep -iE 'xid|aer|nvme|pcie|dpc'` (L1)
2. `nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE` (L2)
3. `dcgmi health -c` + `dcgmi diag -r 1` (L2)
4. `nvidia-bug-report.sh` if filing an RMA. (L2)

### Storage / checkpoint slow or stuck

1. `nfsstat -m` — verify `nconnect`, `vers`, `proto`, `rsize`/`wsize`. (L5)
2. `fio --ioengine=libaio --direct=1` on the mount or local NVMe. (L5)
3. `iostat -x 1` / `biolatency` for tail latency. (L5)
4. `vastpy-cli --json get clusters` + `kubectl get pvc -A` if VAST CSI. (L5/L7)

### Platform / scheduling (Kubernetes / Slurm / BCM)

1. `kubectl get nodes -o wide` / `sinfo -R` (L7)
2. `kubectl describe node` / `scontrol show node <node>` (L7)
3. `kubectl get workloads -A` / `squeue` (L7)
4. `kubectl get pods -n gpu-operator` + `kubectl logs -n gpu-operator <driver pod>` (L7/L2)

### State-changing safety checklist (before any fix)

- Drain the node / job queue first: `kubectl drain --ignore-daemonsets` or `scontrol update ... State=DRAIN Reason="<ticket>"`.
- On NVL72, verify no active IMEX/ComputeDomain job: `kubectl get computedomains,resourceclaims -A`.
- Restarting `nvidia-fabricmanager` kills every CUDA context on the NVSwitch system.
- BIOS/firmware/BMC changes require a change window; some need AC power cycle.
- Switch fabric changes (`ufm_ha_cluster failover`, `nv config apply`) can drop RoCE/IB sessions.

---

*Guide compiled from public forum/GitHub issue titles and snippets.  Always correlate signatures with local logs and vendor release notes before applying workarounds.*
