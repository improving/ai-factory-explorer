# Hardware Matrix

**Use:** find your column, then read down. The row names are the same in both tables and in the runbook template section "Hardware variants".

Two tables: the numbers (for capacity and alert thresholds), then the tools and signals (for the runbooks).
A cell has a value only if a research agent read it on a vendor page that opened on 2026-09-21 (the B300 values: 2026-09-23).
The source of each number is in the "Confirmed facts" section of
sources/1-gpu-node.md or sources/6-amd-and-hardware-generations.md.
**"ask supplier"** = no page gave the value; get it from your NVIDIA, AMD, or server supplier contact.

## Table 1 — The numbers

Columns: Hopper HGX = H100 and H200 SXM. Blackwell HGX = B200 and B300. NVL72 = GB200 and GB300 rack. AMD = MI300X, MI350X, MI355X.

| | Hopper HGX | Blackwell HGX | NVL72 rack | AMD Instinct |
|---|---|---|---|---|
| GPU memory | H100: 80 GB. H200: 141 GB HBM3e. | B200 baseboard: 1.4 TB total for 8 GPUs. B300: 288 GB for each GPU, 2.3 TB for 8 GPUs (the value this training uses; see note 2). | GB200: 13.4 TB HBM3e total for 72 GPUs. GB300: ask supplier. | MI300X: 192 GB HBM3. MI350X, MI355X: 288 GB HBM3E. |
| Power for each GPU | Up to 700 W, configurable. | B300 in an 8-GPU HGX server: 1100 W (Dell spec sheet). B200: ask supplier. | ask supplier | MI350X: 1000 W. MI355X: 1400 W. MI300X: ask supplier. |
| Cooling | ask supplier | Dell B300 servers: air (XE9780, XE9785; 10U, 12 power supplies of 3200 W) or liquid (XE9780L, XE9785L; in the Dell IR7000 rack). Other suppliers: ask supplier. | Liquid-cooled rack. | MI350X: air. MI355X: direct liquid. |
| Scale-up link | NVLink, 900 GB/s for each GPU. | NVLink 5 with NVSwitch, 1.8 TB/s for each GPU; 14.4 TB/s on the baseboard. | NVLink with NVSwitch trays, 130 TB/s for the rack. | AMD Infinity Fabric, 7 links for each GPU. Bandwidth: see note 1. |
| Scale-out NIC | ask supplier | B300: 8 ConnectX-8 SuperNICs, one for each GPU, up to 800 Gb/s each. B200: ask supplier. | ask supplier | ask supplier |
| GPUs in one scale-up domain | 8 | 8 | 72, with 36 Grace CPUs | 8 |
| Failure domain of one scale-up fault | 1 server, 8 GPUs | 1 server, 8 GPUs | Up to 1 rack, 72 GPUs | 1 server, 8 GPUs |

**Note 1.** The AMD MI350 page says "7 AMD Infinity Fabric links operating at 38.4 Gbps" and also "over 1 TB/s of aggregate communication bandwidth per GPU".
The two numbers do not agree if you multiply them; the first one is probably for one lane, not one link.
Do not use them as a threshold. Ask AMD for the link width, and measure the bus bandwidth with `rccl-tests`.

**Note 2.** The B300 memory figures do not agree.
The Dell spec sheet says 270 GB for each GPU, and the NVIDIA HGX page says 2.1 TB for 8 GPUs (8 × 270 GB).
The NVIDIA HGX AI Factory reference architecture and the DGX B300 user guide say 288 GB for each GPU, 2.3 TB for 8 GPUs.
No page explains the difference.
**Decision (2026-09-28):** this training uses 288 GB for each GPU, the value of the NVIDIA reference architecture and the DGX B300 user guide.
On your servers, still read the value that `nvidia-smi` shows, and use it for capacity.

## Table 2 — The tools and the signals

| | Hopper HGX | Blackwell HGX | NVL72 rack | AMD Instinct |
|---|---|---|---|---|
| Services the scale-up domain needs | Fabric Manager | Fabric Manager; on B200 and B300 also the NVLink Subnet Manager (NVLSM), which the Fabric Manager package installs | Fabric Manager, NVLink Subnet Manager, IMEX across the compute trays | none found; ask supplier |
| Management CLI | `nvidia-smi` | same | same | `amd-smi` (`rocm-smi` on older fleets) |
| Health and diagnostics | DCGM, `dcgmi diag` levels 1 to 4 | same | same | ROCm Validation Suite (node); Cluster Validation Suite (cluster) |
| Acceptance test guide | DGX SuperPOD reference architecture, H100 | same, B200 | same, GB200 | AMD Instinct Customer Acceptance Guide |
| Hardware error signal | Xid events in the kernel log, with a published catalogue | same | same | AMDGPU RAS classes `ue`, `ce`, `poison`; counters in `/sys/class/drm/card[N]/device/ras/*_err_count`; `amd-smi ras` decodes the CPER entries |
| Memory error handling | ECC with row remapping; a GPU reset applies the remap | same | same | ECC; a bad page list in an EEPROM on some boards (`gpu_vram_bad_pages`, `amd-smi bad-pages`); optional automatic reboot on a fatal error |
| Collective library and test | NCCL, `nccl-tests` | same | same, with multi-node NVLink | RCCL, `rccl-tests` (code now in `ROCm/rocm-systems`) |
| Prometheus exporter | `dcgm-exporter` | same | same | AMD Device Metrics Exporter (GPU and NIC) |
| Kubernetes operator and resource | NVIDIA GPU Operator, `nvidia.com/gpu` | same | same, plus the DRA driver with ComputeDomains | AMD GPU Operator, `amd.com/gpu` |
| Profiler | Nsight Systems, Nsight Compute | same | same | ROCm Systems Profiler, ROCm Compute Profiler, `rocprofv3` |
| Slurm GRES documentation | Slurm GRES page | same | same | none found |

## What changes for on-call

1. **The method is the same on every hardware type.** Kernel log for the error signal, management CLI, diagnostics tool, collective test, then drain or return. Only the command names and the log format change.
2. **NVL72 changes the failure domain from 8 to 72 GPUs.** A fault in an NVSwitch tray, in the NVLink Subnet Manager, or in IMEX can affect every job in the rack. Drain decisions and the scheduler topology must use the NVLink domain, not the node.
3. **Power goes from 700 W (H100) to 1400 W (MI355X) for each GPU,** and the newest parts need liquid cooling. A thermal or power alarm has a different threshold and a different first action on each type.
4. **AMD has no Xid catalogue.** NVIDIA gives numbered events with published actions; AMD gives RAS classes and counters for each hardware block. An Xid alert rule has no direct copy: write a rule on the RAS counters and on `amd-smi ras`.
5. **Thresholds do not transfer.** Bus bandwidth, diagnostics pass criteria, and ECC limits for an RMA are different for each type. Measure a baseline in the acceptance test and keep it in the runbook section "Hardware variants".

Also: keep one job on one hardware type with node labels for the GPU model and the scale-up domain,
and run one upgrade canary group for each vendor (NVIDIA: driver, CUDA, Fabric Manager; AMD: the ROCm compatibility matrix).
