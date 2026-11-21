# B300 / GB300 / NVL72 Debug Runbooks

Twelve standalone, layer-ordered debug runbooks (RB-01 to RB-09) built from the triage guide (what breaks) and the CLI gist (what tools exist), one facility runbook (RB-10), and two platform-lifecycle runbooks (RB-11 for a pending job, RB-12 for a host that cannot be allocated).
Each runbook follows the 11-section template mandated in [runbook-catalog.md](../handbook/runbook-catalog.md): **Trigger → Impact and blast radius → First 5 minutes → Hardware variants → Decision table → Mitigation → Repair → Evidence to collect → Return to service → Escalation → Customer message**, plus two appendices (Gaps & open questions, Source trace). Work one runbook top to bottom through that sequence.

- Sources: [b300-nvl72-forum-triage-guide.md](../handbook/b300-nvl72-forum-triage-guide.md) (the guide), [cli_utilities_layered_gist.md](../handbook/cli_utilities_layered_gist.md) (the CLI gist, layers L1-L8), the official NCCL environment-variable documentation, and vendor documentation for the commands that the gist does not have.
- Every command carries a provenance tag; the tags are in [_shared/safety-checklist.md](_shared/safety-checklist.md). `[GAP:Gnn]` means "no confirmed command; action only". Each runbook lists its gaps in "Appendix A — Gaps & open questions".
- Rule of thumb from the gist: **work the layers bottom-up**. Rule out hardware (ECC/Xid/thermal/power) before blaming libraries or the application.

## Use in the training

- The [runbook catalogue](../handbook/runbook-catalog.md) has all the runbook rows (G, N, S, P, R, V, I, F) and the lifecycle procedures; its section "Written runbooks" shows which rows these twelve cover.
The rows with no runbook are for the trainees and the team.
- M7 - Incident operations, lab 1: each trainee reviews and extends one of these runbooks, and writes two runbooks for rows that have none.
Lab 2, the game day, names the runbook to open for each injected fault.
- The modules of each layer link the runbooks of that layer, next to their catalogue rows.
- On shift, start from the [command reference](../handbook/command-reference.md) for the first 5 minutes of "slow" and "hung", then open the runbook from the table "Where do I start?" below.

## Severity, priority, and who runs what

The runbooks give a severity, SEV1 to SEV3.
The ticket uses the priority P1 to P4 of [shift-discipline.md](../handbook/shift-discipline.md#1-the-priority), with its clocks.
Use this table to go from one to the other.

| Severity | Meaning used in these runbooks | Priority of the ticket |
|---|---|---|
| SEV1 | Production jobs or a whole NVL72 domain or cluster are down or produce wrong results | P1 |
| SEV2 | A node, a rail, or a job class is degraded or blocked, with a workaround or redundancy | P2 when many nodes, a rail, or an NVL72 domain is affected; else P3 |
| SEV3 | Single-node or non-production impact, or a stop-and-confirm case | P3; P4 for a question |

Who runs what:

- L1 runs the read-only steps of section 3 "First 5 minutes" and the steps that the runbook marks for L1 ([l1-primer.md](../handbook/l1-primer.md)).
L1 does not change the system.
- Each action in sections 6 and 7 starts with the level that runs it, **L2.** or **L3.** in the "Before you run it" cell.
- L1 hands over to L2 at the end of section 3 with no fix, at once for P1 and P2; the escalation rules are in [shift-discipline.md](../handbook/shift-discipline.md#4-the-escalation).

The layer labels L1 to L8 in the tables are the layers of the CLI gist (L1 CPU, OS, and hardware to L8 observability).
They are not the L1 to L3 levels of the people (role-paths.md), and not the lifecycle procedures L1 to L22 of the [runbook catalogue](../handbook/runbook-catalog.md).

## Catalog

| ID | Runbook | Layers | Default severity | Signatures |
|----|---------|--------|------------------|-----------|
| [RB-01](RB-01-nvlink-fabric-fm-imex.md) | NVLink / NVSwitch / Fabric Manager / IMEX / NVLSM failure | L3, L2, L1, L7 | SEV2 | 11 |
| [RB-02](RB-02-nccl-init-hang-slow-transport.md) | NCCL init hang, slow collective, wrong transport, mid-run hang | L6, L4, L3, L1 | SEV2 | 22 |
| [RB-03](RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md) | GPU ECC / Xid / thermal / power / row remap, including silent wrong results | L1, L2, L6 | SEV2 | 12 |
| [RB-04](RB-04-ib-roce-link-switch-ufm.md) | InfiniBand / RoCE link down, slow or flaky; switch, UFM and Cumulus issues | L4, L1 | SEV2 | 15 |
| [RB-05](RB-05-firmware-driver-bmc-bios-dkms-doca.md) | Firmware / driver / BMC / BIOS / DKMS / DOCA-OFED regression | L1, L2, L4 | SEV2 | 9 |
| [RB-06](RB-06-bluefield-dpu-boot-mlx5-eswitch.md) | BlueField / DPU boot, mlx5 firmware-init failures, eSwitch / OVS / HBN datapath | L1, L4 | SEV2 | 10 |
| [RB-07](RB-07-storage-checkpoint-slow-stuck.md) | Storage / checkpoint slow or stuck (L5) | L5, L4, L6 | SEV2 | 6 |
| [RB-08](RB-08-platform-scheduling-slurm-k8s-bcm-power.md) | Platform / scheduling - Slurm, Kubernetes (Rafay), BCM, PSU / DPS power-policy errors | L7, L1 | SEV3 | 11 |
| [RB-09](RB-09-cuda-toolchain-dcgm-false-positive.md) | CUDA toolchain errors and DCGM health false-positives | L1, L2 | SEV3 | 5 |
| [RB-10](RB-10-facility-cooling-power-emergency.md) | Facility emergency: CDU or coolant loop alarm, rack power event, the drain before an emergency thermal shutdown | L1, L7 | SEV2 | — |
| [RB-11](RB-11-job-pending-queue-gang-topology.md) | Job pending: queue quota, gang, topology, or node eligibility | L7, L6 | SEV3 | 4 |
| [RB-12](RB-12-host-not-allocatable-lifecycle.md) | Host not allocatable: lifecycle state, health classification, SKU, or firmware baseline | L1, L2, L4 | SEV3 | 4 |

## Where do I start? (job-level playbooks)

| Situation | Start at | Then |
|---|---|---|
| Job is slow | RB-02 (Scenario D) | RB-04 (fabric), RB-07 (storage), RB-03 (GPU throttle) |
| Job is hung | RB-02 (Scenario E) | RB-03 (Xid), RB-04 (link flap), RB-01 (NVL72) |
| CUDA/NCCL init fails on B300/GB200/NVL72 | RB-01 | RB-02 |
| GPU health / ECC / Xid | RB-03 | RB-01 (NVLink Xids), RB-05 |
| Storage / checkpoint slow or stuck | RB-07 | RB-04, RB-08 |
| Scheduler / node / power-policy problem | RB-08 | RB-05 |
| Job waits, and the cluster has free GPUs | RB-11 | RB-08 (taints and conditions) |
| Cooling or rack power alarm | RB-10 | RB-08 (drain), RB-03 (one node throttles) |
| "Looks like hardware but may not be" (linker `nvlink fatal`, DCGM power warning) | RB-09 | RB-03, RB-01 |

## By layer

| Layer | Runbooks |
|---|---|
| L1 CPU/OS/hardware | RB-03, RB-05, RB-06, RB-09 (every runbook opens with an L1/L2 gate) |
| L2 GPU / node software | RB-03, RB-09 |
| L3 NVLink / NVSwitch / FM / IMEX | RB-01 |
| L4 IB / RoCE fabric | RB-04, RB-06 |
| L5 Storage | RB-07 |
| L6 Collectives / application | RB-02, RB-03 (library repro) |
| L7 Platform | RB-08 |
| L8 Observability | referenced from RB-04, RB-07, RB-08 |

RB-10 (facility: power and cooling) is outside these layers.

## Symptom-to-runbook lookup

Alphabetical by signature text, generated from each runbook's "1. Trigger" table.
`#` is the number of the signature in the issue inventory that the runbooks were built from (not in this repository); rows that the review added have `—` and are not in this table.

| Signature / symptom | # | Runbook |
|---|---|---|
| "Port is up but unreachable" | 57 | [RB-04](RB-04-ib-roce-link-switch-ufm.md) |
| Alert noise / metrics missing during triage | 96 | [RB-08](RB-08-platform-scheduling-slurm-k8s-bcm-power.md) |
| Bare-metal PCIe P2P broken or slow while `topo -p2p` says OK (IOMMU/ACS) | 31 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| BCM 11 CVE-2025-62878: `Local Path Provisioner updated to v0.0.34` | 89 | [RB-08](RB-08-platform-scheduling-slurm-k8s-bcm-power.md) |
| BF3 DPU mode: `eSwitch never delivers vport traffic to representors` | 79 | [RB-06](RB-06-bluefield-dpu-boot-mlx5-eswitch.md) |
| BF3 firmware update hang: `eMMC probed` then no output; only `UP_TIME` increments | 72 | [RB-06](RB-06-bluefield-dpu-boot-mlx5-eswitch.md) |
| BF3 mixed port link type (IB + Ethernet) confusion | 75 | [RB-06](RB-06-bluefield-dpu-boot-mlx5-eswitch.md) |
| BF3 TLP emulation stays disabled after reset (DOCA 3.5 / FW 32.50.1002) | 77 | [RB-06](RB-06-bluefield-dpu-boot-mlx5-eswitch.md) |
| Bootstrap `getenv()` SIGSEGV under glibc <2.41 | 28 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| `Call to connect failed` / `connect timeout` | 14 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| Checkpoint write slow or stuck; dataloader stall (saw-tooth SM activity) | 80 | [RB-07](RB-07-storage-checkpoint-slow-stuck.md) |
| `cicc dies with SIGILL lowering __nvvm_atom_add_gen_d for sm_120` | 100 | [RB-09](RB-09-cuda-toolchain-dcgm-false-positive.md) |
| Client NFS low throughput; multipath options not in use | 81 | [RB-07](RB-07-storage-checkpoint-slow-stuck.md) |
| `cliqueId <id> state 3` | 7 | [RB-01](RB-01-nvlink-fabric-fm-imex.md) |
| ConnectX-5 Ex: `PCIe Gen4 equalization completes but speed change to 16GT/s never asserted` | 66 | [RB-05](RB-05-firmware-driver-bmc-bios-dkms-doca.md) |
| ConnectX-7 NICs disappear after system update: `cx7-pcie-hotplug driver issue` | 67 | [RB-05](RB-05-firmware-driver-bmc-bios-dkms-doca.md) |
| ConnectX-8 SuperNIC mode questions (IB vs Ethernet) | 60 | [RB-04](RB-04-ib-roce-link-switch-ufm.md) |
| Crash during communicator init with stack limit `unlimited` | 20 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| `crt/host_config.h: No such file or directory` (CUDA 13.0 on GitHub Actions windows-2025) | 99 | [RB-09](RB-09-cuda-toolchain-dcgm-false-positive.md) |
| cuBLASLt: silently wrong FP16/BF16/FP8 GEMM under `CUDA_MPS_ACTIVE_THREAD_PERCENTAGE` with `algoId 66` cluster kernels | 41 | [RB-03](RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md) |
| `Cuda failure 1 'invalid argument'` and `transport/nvls.cc:... NCCL WARN Cuda failure 1 'invalid argument'` / `transport/nvls.cc:... Cuda failure ...` | 5 | [RB-01](RB-01-nvlink-fabric-fm-imex.md) |
| `Cuda failure 800 'operation not permitted'` | 4 | [RB-01](RB-01-nvlink-fabric-fm-imex.md) |
| `Cuda failure 802 'system not yet initialized'` | 1 | [RB-01](RB-01-nvlink-fabric-fm-imex.md) |
| cuDSS / cuSolver: API shape/lda/n questions | 45 | [RB-03](RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md) |
| cuDSS: `UBATCH_SIZE > ~160` → NaN solutions depending on unrelated device memory | 42 | [RB-03](RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md) |
| cuMem UDS fd exchange hang on single-node PCIe (no NVLink); `NCCL_CUMEM_ENABLE=0` isolates it | 25 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| CX8 C8180: port split to Config-7 creates Ethernet port instead of IB | 54 | [RB-04](RB-04-ib-roce-link-switch-ufm.md) |
| `DCGM 4.7.0 reports Power Health Warning on one L40S` | 98 | [RB-09](RB-09-cuda-toolchain-dcgm-false-positive.md) |
| DCGM power-warning that looks like a thermal/power fault (look-alike case of 98) | 101 | [RB-09](RB-09-cuda-toolchain-dcgm-false-positive.md) |
| `Detected Pre-NVL5 system` | 3 | [RB-01](RB-01-nvlink-fabric-fm-imex.md) |
| DGX Station sizing: 2× RAM-to-VRAM ratio confusion; local NVMe space / 1T LLM model sizing at FP4; ConnectX-8 SuperNIC mode questions (IB vs Ethernet) | 94 | [RB-08](RB-08-platform-scheduling-slurm-k8s-bcm-power.md) |
| `DMA-BUF not supported` (RTX 5090 with open kernel module) | 65 | [RB-05](RB-05-firmware-driver-bmc-bios-dkms-doca.md) |
| DOCA 3.5.0 DKMS installer fails to build on `RHEL 9.8 kernel 5.14.0-687.25.1` | 62 | [RB-05](RB-05-firmware-driver-bmc-bios-dkms-doca.md) |
| DOCA-OFED 3.4.0 repository `SSL Handshake Failure on Debian 13 (Trixie)` | 63 | [RB-05](RB-05-firmware-driver-bmc-bios-dkms-doca.md) |
| `Duplicated LID forCA GUID` | 49 | [RB-04](RB-04-ib-roce-link-switch-ufm.md) |
| Event names a topology domain, no domain fits | 104 | [RB-11](RB-11-job-pending-queue-gang-topology.md) |
| `Exiting boot services...` / UEFI `GET P-S:fail(14)` (BlueField-3 boot hang) | 71 | [RB-06](RB-06-bluefield-dpu-boot-mlx5-eswitch.md) |
| `failed to extend /dev/shm/nccl-*` and `unlink shared memory /dev/shm/nccl-* failed` | 19 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| Firmware/BMC/BIOS update or QM9700/MLNX-OS upgrade path questions | 69 | [RB-05](RB-05-firmware-driver-bmc-bios-dkms-doca.md) |
| `GDAKI ... TRANSPORT_RETRY_EXC_ERR` | 24 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| `gdscheck` result shows `NVMe P2PDMA unsupport` | 64 | [RB-05](RB-05-firmware-driver-bmc-bios-dkms-doca.md) |
| `gNMI per-channel PHY telemetry mismatch` vs PPCNT | 52 | [RB-04](RB-04-ib-roce-link-switch-ufm.md) |
| Half-precision intrinsics returning wrong results for subnormal/constant-folded inputs (`__sincosf`, `__sinf`, `__tanf`, `htanh`, `hexp`, `hatan`); CUDA 13.2 double-precision math bugs on `sm_80` | 44 | [RB-03](RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md) |
| HBN 3.2.2 L3 EVPN VXLAN: `TX packets massively dropped despite correct control-plane state` | 76 | [RB-06](RB-06-bluefield-dpu-boot-mlx5-eswitch.md) |
| Host is quarantined, or the firmware differs from the baseline | 107 | [RB-12](RB-12-host-not-allocatable-lifecycle.md) |
| Host is reachable, healthy to the eye, and cannot be allocated | 106 | [RB-12](RB-12-host-not-allocatable-lifecycle.md) |
| `healthMask 0xaa` | 6 | [RB-01](RB-01-nvlink-fabric-fm-imex.md) |
| `hm_ports_health_policy_file` option does not work | 50 | [RB-04](RB-04-ib-roce-link-switch-ufm.md) |
| `iblinkinfo -S GUID` does not work | 51 | [RB-04](RB-04-ib-roce-link-switch-ufm.md) |
| `ibv_reg_mr failed` / `ibv_create_qp failed` (also `Call to ibv_reg_mr failed`) | 18 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| Job hangs mid-run / PyTorch NCCL watchdog timeout | 29 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| Job is `Pending` while free GPUs exist | 102 | [RB-11](RB-11-job-pending-queue-gang-topology.md) |
| `kernel oops with rcprdma` (DOCA 3.4→3.5 regression on ConnectX-5/ConnectX-6; CX4 unaffected) | 61 | [RB-05](RB-05-firmware-driver-bmc-bios-dkms-doca.md) |
| `libnccl-net.so not found` | 17 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| Link below rate, flapping, high BER (`iblinkinfo`, `perfquery -x`, `mlxlink`) | 47 | [RB-04](RB-04-ib-roce-link-switch-ufm.md) |
| Local NVMe failure or slow local cache | 84 | [RB-07](RB-07-storage-checkpoint-slow-stuck.md) |
| `mlx5_core ... wait_fw_init:316: Waiting for FW initialization, timeout abort` | 73 | [RB-06](RB-06-bluefield-dpu-boot-mlx5-eswitch.md) |
| `mlx5_load_one failed with error code -16` | 74 | [RB-06](RB-06-bluefield-dpu-boot-mlx5-eswitch.md) |
| `mlxlink` PRBS test does not work | 53 | [RB-04](RB-04-ib-roce-link-switch-ufm.md) |
| MNNVL: `SIGSEGV in ncclCommInitRank` at `world_size >= 44` with `healthMask 0xaa` | 21 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| MPI-side: hang at startup or segfault in `libmpi.so`; `PMIX ERROR: ... gds_ds12_lock_pthread.c`; `UCX WARN network device 'X' is not available`; `UCX ERROR no active messages transport ... Unsupported operation` | 33 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| Multi-node NVLink job can't start (ComputeDomain / IMEX channel claim) | 11 | [RB-01](RB-01-nvlink-fabric-fm-imex.md) |
| `NCCL INFO NET : Using interface lo:127.0.0.1` | 15 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| `NCCL_CHUNK_SIZE` / `NCCL_P2P_NET_CHUNKSIZE >= 1MiB` → wrong results + `Xid 31` | 23 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| `NCCL_IGNORE_NET_MISMATCH` turns heterogeneous HCA misconfig into silent hang | 22 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| `ncclCommShrink` invalid `excludeRanksList` aborts parent communicator | 27 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| `ncclInvalidArgument` / `ncclInvalidUsage` | 13 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| `ncclSystemError` / `ncclUnhandledCudaError` | 12 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| `Network performance causing GPU idle time` | 58 | [RB-04](RB-04-ib-roce-link-switch-ufm.md) |
| NMC 2.0 vs 1.1: `SR-IOV NetworkNodePolicy` step difference for DGX B200/BasePOD | 90 | [RB-08](RB-08-platform-scheduling-slurm-k8s-bcm-power.md) |
| Node `NotReady` with no other cause (time skew) | 95 | [RB-08](RB-08-platform-scheduling-slurm-k8s-bcm-power.md) |
| `NV_ERR_FABRIC_MANAGER_NOT_PRESENT` | 2 | [RB-01](RB-01-nvlink-fabric-fm-imex.md) |
| nvCOMP: `nvcompBatchedZstdDecompressAsync never returns on corrupted zstd frame`; nvCOMP ANS FLOAT8_E4M3: single-byte decompression leaves `device_statuses` unchanged | 43 | [RB-03](RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md) |
| `nvlink fatal : Could not open input file '/usr/lib/x86_64-linux-gnu/librt.a'` | 97 | [RB-09](RB-09-cuda-toolchain-dcgm-false-positive.md) |
| `NVSwitch on H200 passthrough in ESXi` | 10 | [RB-01](RB-01-nvlink-fabric-fm-imex.md) |
| Out-of-order DPU packets through default OVS bridge (`OUT_OF_ORDER`) | 78 | [RB-06](RB-06-bluefield-dpu-boot-mlx5-eswitch.md) |
| PFC / ECN / CNP counters growing (`ethtool -S`) | 48 | [RB-04](RB-04-ib-roce-link-switch-ufm.md) |
| Pod stuck `Pending` / `ContainerCreating`; pod `Running` but no GPU | 91 | [RB-08](RB-08-platform-scheduling-slurm-k8s-bcm-power.md) |
| Pod `Pending` with no queue event | 105 | [RB-11](RB-11-job-pending-queue-gang-topology.md) |
| `policy capability max cannot be more than active psu policy limit max` (DPS 0.9.0 on DGX_B300) | 86 | [RB-08](RB-08-platform-scheduling-slurm-k8s-bcm-power.md) |
| `Port ... Active/ LinkUp` expected, but `ibstat` shows `Polling`, `Disabled` or `LinkDown` | 46 | [RB-04](RB-04-ib-roce-link-switch-ufm.md) |
| `Problems Integrating BCM to an existing cluster` (Slurm already present) | 88 | [RB-08](RB-08-platform-scheduling-slurm-k8s-bcm-power.md) |
| PodGroup `Pending`, free GPUs are scattered | 103 | [RB-11](RB-11-job-pending-queue-gang-topology.md) |
| PVC stuck `Pending` (VAST CSI) | 83 | [RB-07](RB-07-storage-checkpoint-slow-stuck.md) |
| QM9700 ↔ SB7800 connectivity (NDR vs EDR signaling) | 55 | [RB-04](RB-04-ib-roce-link-switch-ufm.md) |
| Rafay controller degraded; blueprint roll | 93 | [RB-08](RB-08-platform-scheduling-slurm-k8s-bcm-power.md) |
| Reboot with no kernel log; suspected BMC/BIOS/firmware fault | 68 | [RB-05](RB-05-firmware-driver-bmc-bios-dkms-doca.md) |
| Released host still reaches a tenant network | 108 | [RB-12](RB-12-host-not-allocatable-lifecycle.md) |
| RoCE storage slow (PFC/ECN growth on the storage leaf) | 85 | [RB-07](RB-07-storage-checkpoint-slow-stuck.md) |
| `sinfo`/`squeue` nodelist empty; `sinfo -R` shows no nodes in queue / empty nodelist | 87 | [RB-08](RB-08-platform-scheduling-slurm-k8s-bcm-power.md) |
| Slow collective / low bus bandwidth | 30 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| Slurm job didn't start or failed; GRES missing | 92 | [RB-08](RB-08-platform-scheduling-slurm-k8s-bcm-power.md) |
| Switchless ring host chaining with `MCX755106AC-HEAT` | 59 | [RB-04](RB-04-ib-roce-link-switch-ufm.md) |
| SKU validation fails after a repair | 109 | [RB-12](RB-12-host-not-allocatable-lifecycle.md) |
| `Synchronous exception at 0x0000000000000` (GB300 compute tray boot) | 70 | [RB-06](RB-06-bluefield-dpu-boot-mlx5-eswitch.md) |
| Tag matching offload confusion on CX7 IB with NCCL/OpenMPI | 32 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| Thermal / power throttling or a power cap on a GPU (no verbatim string; the guide's thermal-mitigation case, §2). The DCGM power-warning string is owned by RB-09 | 40 | [RB-03](RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md) |
| UFM event / subnet-manager failover / `ufm_telemetry` counters missing from dashboards | 56 | [RB-04](RB-04-ib-roce-link-switch-ufm.md) |
| `Using network Socket` (when IB expected) | 16 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| VAST cluster / CNode / VMS issue | 82 | [RB-07](RB-07-storage-checkpoint-slow-stuck.md) |
| `wrap_ibv_reg_mr_iova2(NULL, ...)` segment fault | 26 | [RB-02](RB-02-nccl-init-hang-slow-transport.md) |
| Xid 137 (`NVLink TLC RX PRIV`) | 9 | [RB-01](RB-01-nvlink-fabric-fm-imex.md) |
| Xid 171 | 37 | [RB-03](RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md) |
| Xid 31 | 38 | [RB-03](RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md) |
| Xid 48 | 34 | [RB-03](RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md) |
| Xid 63 / Xid 64 | 35 | [RB-03](RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md) |
| Xid 74 / 149 | 8 | [RB-01](RB-01-nvlink-fabric-fm-imex.md) |
| Xid 79 | 39 | [RB-03](RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md) |
| Xid 94 / Xid 95 | 36 | [RB-03](RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md) |

## Merge and split decisions

| Decision | Rationale |
|---|---|
| RB-01 and RB-02 are separate | RB-01: a fabric service is unhealthy (FM/IMEX/NVLSM). RB-02: library/transport misconfigured on a healthy fabric. |
| NVLink, FM, IMEX and NVLSM are merged in RB-01 | Same first steps (FM → IMEX → channel permissions) and the same restart/drain gate. |
| NCCL init hang, slow collective, wrong transport and mid-run hang are merged in RB-02 | One §11 playbook; they diverge only at the scenario fork. |
| ECC, Xid, thermal, power, row remap and silent wrong results are merged in RB-03 | One L1/L2 hardware-health gate; the library repro is the last fork. |
| RB-04 (fabric/switch) is separate from RB-06 (DPU datapath) | Representors vs HCA ports need different commands. |
| RB-05 (FW/driver) is separate from RB-06 (DPU boot, mlx5 init) | Host driver/DKMS vs rshim/boot state machine. `wait_fw_init` lives in RB-06 and links to RB-05. |
| RB-09 is separate | A stop-and-confirm runbook for signatures that sound like hardware but are not. |
| Xid 137 → RB-01, Xid 94/95 → RB-03 | NVLink parity fault is the parent; ECC read-out is RB-03. |
| MNNVL SIGSEGV at `world_size >= 44` → RB-02; `healthMask 0xaa` → RB-01 | Known NCCL bug vs fabric health. |
| CX5 Ex 8GT/s and CX7 hotplug/DPC → RB-05 | PCIe/firmware cause, though the guide lists CX7 under BlueField. |
| Half-precision intrinsics wrong results → RB-03; `DMA-BUF not supported` → RB-05 | Correctness bugs rule out hardware first; driver limitation. |

## Items without a runbook

- DGX Station sizing and SuperNIC mode questions (signature 94): not a fault; handled as a look-alike in RB-08 and by the sizing utility below.
- Dell PowerEdge wiki (signature 102): no extractable signatures. Dell evidence tooling (`racadm techsupreport collect` + `export`) is used in RB-03, RB-05 and RB-08 escalation.

## Related tools

- **AI Factory Explorer** (DC sizing and visualization utility): `<link TBD>`

## Shared procedures and where they live

| Procedure | Owner |
|---|---|
| FM / IMEX health check | RB-01 |
| ECC / Xid / row-remap read-out | RB-03 |
| `ib_write_bw` fabric isolation, `perfquery`, `iblinkinfo` | RB-04 |
| NCCL scenario forks, `ulimit`/`/dev/shm` checks | RB-02 |
| Drain / cordon / uncordon / DRAIN / RESUME and return to service | RB-08 (copy in `_shared/safety-checklist.md`) |

## Files

- [_ledger/command-ledger.md](_ledger/command-ledger.md): every tagged command and where it is used (`python3 runbooks/_ledger/audit.py --ledger` regenerates it).
- [_ledger/audit.py](_ledger/audit.py): mechanical audit (front matter, the 11 template sections in order, tags, mitigation/repair table shape, layer order, signature coverage).
