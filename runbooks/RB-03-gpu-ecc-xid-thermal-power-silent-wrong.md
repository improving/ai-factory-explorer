---
id: RB-03
title: GPU ECC / Xid / thermal / power / row remap, including silent wrong results
owner_layers: [L1, L2, L6]
severity:
  default: SEV2
  escalate_to: "SEV1 on Xid 95 (uncontained ECC) during a production job, repeated Xid 79 across nodes, or confirmed silent wrong results in production output"
signatures: [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45]
guide_refs: ["§2", "§3", "D (GPU Xid codes)", "R4", "R5", "P (GPU health / ECC / Xid)"]
gist_refs: ["L1", "L2", "L3", "L6", "§9", "§10"]
related:
  upstream: [RB-01, RB-02]
  downstream: [RB-01, RB-05, RB-09, RB-02]
  lookalike: [RB-09, RB-02]
gaps: [G01, G15]
---

# RB-03 — GPU ECC / Xid / thermal / power / row remap, including silent wrong results

This runbook owns the **ECC / Xid / row-remap read-out**. Other runbooks link here for it. Library "silent wrong result" signatures are handled last, after hardware health is ruled out.

## 1. Trigger

| # | Signature (verbatim) | Decoder meaning |
|---|---|---|
| 34 | Xid 48 | Uncorrectable double-bit error (DBE) in GPU framebuffer memory. Check for growing uncorrectable counters; persistent means RMA candidate. |
| 35 | Xid 63 / Xid 64 | Row remapper marked a new row (63: a GPU reset is needed to activate it) / remap state changed (64). Repeated growth means failing memory. |
| 36 | Xid 94 / Xid 95 | 94: contained ECC error (often follows NVLink Xid 137; may not increment ECC counters). 95: uncontained ECC error, context may be killed; more urgent. |
| 37 | Xid 171 | GDDR uncorrectable DRAM error in a specific FBPA/subpartition. Similar to Xid 48; pinpoints the memory partition. |
| 38 | Xid 31 | GPU MMU fault: bad virtual/physical address or malformed DMA. Look at what ran just before. |
| 39 | Xid 79 | GPU "fell off the bus": PCIe link/train error. Also PCIe AER / DPC messages. |
| 40 | Thermal / power throttling or a power cap on a GPU (no verbatim string; the guide's thermal-mitigation case, §2). The DCGM power-warning string is owned by RB-09 | Throttle reasons in `nvidia-smi -q`; BMC sensors for inlet/PSU. |
| 41 | cuBLASLt: silently wrong FP16/BF16/FP8 GEMM under `CUDA_MPS_ACTIVE_THREAD_PERCENTAGE` with `algoId 66` cluster kernels | Library/MPS interaction, not hardware, once GPU health is clean. |
| 42 | cuDSS: `UBATCH_SIZE > ~160` → NaN solutions depending on unrelated device memory | Library buffer-sizing edge case. |
| 43 | nvCOMP: `nvcompBatchedZstdDecompressAsync never returns on corrupted zstd frame`; nvCOMP ANS FLOAT8_E4M3: single-byte decompression leaves `device_statuses` unchanged | Library hang/status bug on bad input. |
| 44 | Half-precision intrinsics returning wrong results for subnormal/constant-folded inputs (`__sincosf`, `__sinf`, `__tanf`, `htanh`, `hexp`, `hatan`); CUDA 13.2 double-precision math bugs on `sm_80` | Toolchain/library correctness bugs. Rule out hardware first. |
| 45 | cuDSS / cuSolver: API shape/lda/n questions | Usage questions, not an incident. Not a hardware or runtime fault. |
| — | Xid 140 | Unrecovered ECC error in GPU memory (catalogue G2). Treat it like Xid 48/95: drain the node; RMA candidate when it repeats or the uncorrectable counters grow. |
| — | Xid 13 | Graphics engine exception. Usually the application (for example an out-of-range access) and not the GPU (catalogue G5). Prove it with decision step 13 before you drain or RMA. |
| — | Xid 43 | The GPU stopped the context after an application fault. Usually the application and not the GPU (catalogue G5). Prove it with decision step 13. |

## 2. Impact and blast radius

- **Severity:** SEV2 by default. SEV1 for Xid 95, repeated Xid 79, or confirmed wrong results in production. SEV3 for a single Xid 63/64 with a clean counter after reset.
- **Priority:** SEV2 is P3 in the P1 to P4 table of [shift-discipline.md](../handbook/shift-discipline.md#1-the-priority): one GPU or one node, with a capacity workaround.
SEV2 is P2 when many nodes or an NVL72 domain are affected.
SEV1 is P1; SEV3 is P3.
- **Blast radius:** one GPU (the jobs scheduled on it fail or corrupt output) for ECC/Xid 79/thermal; **one node** (8 GPUs on HGX; 4 GPUs, one compute tray, on NVL72) when the node must be drained or reset; **one job's output** for silent wrong results — no other node or job is affected until the job spreads the corrupted checkpoint. On NVL72 a drained compute tray removes 4 of the rack's 72 GPUs from the domain's jobs.

## 3. First 5 minutes

1. `dmesg -T | grep -iE 'xid|aer|nvme|pcie|dpc'` `[C:L1]` — expected: no Xid/AER in the last hour; otherwise note the Xid number and the GPU/PCI address.
2. `nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE` `[C:L2]` — expected: uncorrectable counters 0, no pending/failed row remap, no unexpected throttle.
3. `dcgmi health -c` `[C:L2]` — expected: `Healthy` for every GPU.

Dashboards to open: the Grafana GPU dashboard (dcgm-exporter) for the node — ECC counters, temperature, power, throttle reasons — and the BMC sensor view (`ipmitool sensor` equivalent).

**Who runs it:** L1 runs steps 1, 2, 3 (read-only; [l1-primer.md](../handbook/l1-primer.md)). Power cap, GPU reset, drain, and reboot are L2.

## 4. Hardware variants

Row names follow [hardware-matrix.md](../handbook/hardware-matrix.md), Table 2. The AMD signal mapping is the catalog's G1/G2/G6/G8 table ("to be confirmed" = no public page gave the signal).

| | Hopper HGX (H100/H200) | Blackwell HGX (B200/B300) | NVL72 rack (GB200/GB300) | AMD Instinct (MI300X/MI350X/MI355X) |
|---|---|---|---|---|
| Management CLI | `nvidia-smi` | same | same | `amd-smi` (`rocm-smi` on older fleets) |
| Hardware error signal | Xid events, published catalogue | same | same | RAS classes `ue`, `ce`, `poison`; `/sys/class/drm/card[N]/device/ras/*_err_count`; no Xid catalogue |
| Memory error handling | ECC with row remapping; a GPU reset applies the remap | same | same | ECC; bad-page list in an EEPROM (`gpu_vram_bad_pages`, `amd-smi bad-pages`) |
| Health and diagnostics | DCGM, `dcgmi diag` levels 1-4 | same | same | ROCm Validation Suite (node); Cluster Validation Suite (cluster) |
| Prometheus exporter | `dcgm-exporter` | same | same | AMD Device Metrics Exporter |
| Power per GPU | up to 700 W | B300: 1100 W (Dell) | ask supplier | MI350X: 1000 W; MI355X: 1400 W |

Catalog NVIDIA→AMD signal deltas for this topic: Xid 79 → PCIe AER events + GPU absent from `amd-smi list` (message text: to be confirmed). Xid 48/63/64 → RAS `ue`/`ce` counters + `amd-smi metric --ecc` + bad-pages. Thermal/power → `amd-smi metric` (power, temperature, clocks). Silent wrong results → ROCm Validation Suite + `rccl-tests` compare run on a known-good node. Thresholds do not transfer between types; measure a baseline in the acceptance test (hardware-matrix, "What changes for on-call").

## 5. Decision table

| # | Layer | Command | Good looks like | Bad looks like | Next |
|---|---|---|---|---|---|
| 1 | L1 | `dmesg -T \| grep -iE 'xid\|aer\|nvme\|pcie\|dpc'` `[C:L1]` | No Xid/AER in the last hour | Xid number and the GPU/PCI address | Note the Xid; step 2. Xid 13/31/43 (application-caused class): also step 13 after steps 2-9 |
| 2 | L1 | `ipmitool sensor` `[C:L1]` | Temps, fans, PSU voltages in range | Over-temp, fan fail, PSU alarm | Thermal/power: Mitigation A3 and step 3. Hardware alarm: escalate to site hardware |
| 3 | L1 | `ipmitool sel list` `[C:L1]` | No PSU/thermal events near the Xid time | Events at the same timestamp | Correlate; PSU/BMC/firmware cause: RB-05 |
| 4 | L1 | `lspci -tv` `[C:L1]` | GPU appears in the PCIe tree | GPU missing or on a degraded link (Xid 79) | Xid 79: reseat/replace via site hardware; escalate |
| 5 | L2 | `nvidia-smi` `[C:L2]` | All GPUs present, temps/power normal | GPU missing or "ERR!" | Missing: step 4/escalate |
| 6 | L2 | `nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE` `[C:L2]` | Uncorrectable counters 0; no pending/failed row remap; no unexpected throttle | Growing uncorrectable ECC; pending remap; remap failure; thermal/power throttle reasons | Pending remap (Xid 63): Repair A2. Growth or failure, or Xid 140: RMA path (Repair A6) |
| 7 | L2 | `nvidia-smi -q -d POWER` `[X:28]` | Power draw below the cap | At cap while hot | Throttle/thermal path (Mitigation A3) |
| 8 | L2 | `dcgmi health -c` `[C:L2]` | `Healthy` for every GPU | Warnings/failures | Power-only warning with clean steps 2, 6, 7: RB-09. Otherwise step 9 |
| 9 | L2 | `dcgmi diag -r 1` `[C:L2]` | Pass | Fail | Escalate (Repair A6); after drain run `dcgmi diag -r 3` (Repair A4) |
| 10 | L3 | `nvidia-smi nvlink -s` `[C:L3]` | Links active, counters 0 | Xid 94/95 with link errors | NVLink is the parent fault: RB-01 |
| 11 | L6 | Reproduce the wrong result on one rank, with MPS off or `CUDA_MPS_ACTIVE_THREAD_PERCENTAGE=100` `[E]`/`[X:21]`, and on a second node | Result correct with MPS off, or correct on the other node | Wrong only with MPS partitioning | Library/MPS bug: Mitigation A5 and escalate to NVIDIA with repro |
| 12 | L6 | `compute-sanitizer <app>` `[X:28]` | No errors reported | Memory errors in the app | Application bug, not hardware |
| 13 | L6 | Xid 13/31/43: run the same job (same input, same rank count) on a known-good node, then read its kernel log: `dmesg -T \| grep -iE 'xid\|aer\|nvme\|pcie\|dpc'` `[C:L1]` | No Xid on the known-good node; the Xid stays on the first GPU with other jobs | The same Xid on the known-good node: the Xid follows the job, not the GPU | Xid follows the job: the workload is the cause; hand over to the application owner with both Xid lines, the job ID, and the node names. Return the first node after steps 6-9 are clean. Xid stays on the GPU: steps 6-9 and Repair |

Rule: reach steps 11-12 only after steps 1-9 are clean. A clean GPU plus a result that changes with MPS/batch size/node points at the library, not the GPU.
The same rule applies to step 13.

**Who runs it:** L1 may run steps 1-8 and 10 (read-only). All other steps are L2 or L3: steps 11 and 13 re-run a job (L2, the job owner agrees, a test allocation).

### Read-only diagnostics (by layer)

| Layer | Command | Tag | Look for |
|---|---|---|---|
| L1 | `dmesg -T \| grep -iE 'xid\|aer\|nvme\|pcie\|dpc'` | `[C:L1]` | Xid codes, AER, DPC |
| L1 | `journalctl -k` | `[C:L8]` | Same, via journald, when `dmesg` has rotated |
| L1 | `ipmitool sensor`, `ipmitool sel list` | `[C:L1]` | Thermal/PSU events |
| L1 | `lspci -tv` | `[C:L1]` | GPU on the PCIe tree |
| L2 | `nvidia-smi`, `nvidia-smi -q` | `[C:L2]` | Temps, clocks, throttle reasons, driver version |
| L2 | `nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE` | `[C:L2]` | Corrected/uncorrected counts, pending/failed remap |
| L2 | `dcgmi health -c`, `dcgmi diag -r 1` | `[C:L2]` | Health verdicts |
| L3 | `nvidia-smi nvlink -s`, `nvidia-smi nvlink -e` | `[C:L3]`, `[X:03]` | NVLink link state and errors |
| L6 | `py-spy dump --pid <pid>` | `[C:L6]` | Where a hung library call is blocked (nvCOMP hang) |
| L6 | `compute-sanitizer <app>` | `[X:28]` | Memory errors in the application |
| L6 | `nvcc --version` | `[X:28]` | Toolkit version for the CUDA 13.2 double-precision bug |

### Differential diagnosis

| Looks like | How to tell | Go to |
|---|---|---|
| NVLink fault causing Xid 94/95 | Xid 137/74/149 on the same timeline; `nvidia-smi nvlink -e` shows errors | RB-01 |
| NCCL buffer bug (`NCCL_P2P_NET_CHUNKSIZE >= 1MiB`) causing Xid 31 | Xid 31 right after NCCL traffic, with a large chunk size set | RB-02 |
| DCGM power false-positive | `dcgmi health -c` warns on power but `nvidia-smi -q` and `ipmitool sensor` are clean | RB-09 |
| Firmware/BMC power policy fault | SEL shows PSU events; DPS policy error | RB-05, RB-08 |
| Application bug | `compute-sanitizer` finds errors; result changes with seed or batch size on healthy GPUs | Application owner |
| Application-caused Xid (13, 31, 43) | The same job on a known-good node gives the same Xid: the Xid follows the job, not the GPU. A Xid that stays on one GPU with different jobs is hardware | Step 13, then the application owner |
| Library bug masquerading as hardware | ECC and `dcgmi diag` clean; wrong only with MPS partitioning or large `UBATCH_SIZE` | Step 11, Mitigation A5 |
| cuDSS/cuSolver usage question | Wrong shape/lda/n arguments, no Xid | Application owner (signature 45) |

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

Mitigation actions stop the customer impact fast but are **not root-cause fixes**; the Repair section holds the correction.

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A3 | Cap GPU power for thermal mitigation `[C:§10]` | `nvidia-smi -pl <watts> -i <gpu>` | **L2.** The job owner agrees (the cap slows the job). `nvidia-smi -q` shows thermal/power throttle and `ipmitool sensor` confirms a cooling or power cause | Lower performance on that GPU | Remove the cap (set back to the default limit); **record the change and remove after the cooling fix** |
| A5 | Workload change for library bugs `[E]`/`[X:21]` | `CUDA_MPS_ACTIVE_THREAD_PERCENTAGE=100 <app>` or stop MPS: `echo quit \| nvidia-cuda-mps-control` (root); cuDSS: set `UBATCH_SIZE` ≤ 160 | **L2.** The job owner agrees. Hardware ruled out (steps 1-9); repro confirmed | MPS stop affects every MPS client on the node. Workload change only | Restore the previous MPS setting; unset the variable |

## 7. Repair

Remediation ladder: drain the node (A1) → GPU reset (A2) → reboot or power cycle (A7) → post-repair stress test (A4) → RMA (A6).

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A1 | Drain the node (RB-08 shared procedure) `[C:§10]` | `kubectl drain --ignore-daemonsets` or `scontrol update ... State=DRAIN Reason="<ticket>"` | **L2.** ComputeDomain check on NVL72 | Evicts jobs; on NVL72 one drain can stop a 72-GPU job | `kubectl uncordon` / `scontrol update ... State=RESUME` after tests pass |
| A2 | Reset one GPU to activate a pending row remap (Xid 63) `[C:§10]` | `nvidia-smi -r -i <gpu>` | **L2.** No processes on the GPU (`nvidia-smi`); **not** if part of a live NVLink-domain job; node drained | GPU unavailable for the reset; its jobs fail | None; verify with `nvidia-smi -q -d ROW_REMAPPER` |
| A4 | Stress test after repair `[C:L2]` | `dcgmi diag -r 3` (long, ~15 min) or `dcgmi diag -r 4` (extended) | **L2.** **Drain first** | Heavy GPU load; node unavailable for jobs | Stop the test; node stays drained until it passes |
| A6 | RMA / hardware hand-off `[C:L2]` | `nvidia-bug-report.sh` (and Dell: `racadm techsupreport collect` + `export` `[C:L1]`) | **L2.** Node drained; evidence below captured | None (read-only collection); node stays out of service | n/a |
| A7 | Reboot or BMC power cycle after drain `[C:§10]` | Reboot / BMC power cycle | **L2.** Drained; never on an active IMEX domain without the job owner | Node jobs stop | None |

## 8. Evidence to collect

Evidence to capture: `dmesg -T` Xid lines with timestamps, `nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE` before and after any reset, `dcgmi diag` output, `ipmitool sel list`, `nvidia-bug-report.sh`.

## 9. Return to service

Follow the shared drain and return-to-service procedure in [_shared/safety-checklist.md](_shared/safety-checklist.md) (owned by RB-08).
Add these RB-03 checks before the return:
1. After reset: `nvidia-smi -q -d ROW_REMAPPER` shows the remap applied with no pending row; `nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE` shows counters stable.
2. `dmesg -T | grep -iE 'xid|aer'` shows no new events for a soak period.
3. `dcgmi health -c` healthy; `dcgmi diag -r 3` passes on the drained node. Then return via RB-08.
4. For library issues: the reproducer gives the correct result with the workaround, and the workaround is recorded.

## 10. Escalation

- **Internal:** L1 hands over to L2 at the end of section 3 with no fix, at once for P1 and P2. L2 hands over to L3 when the runbook ends with no fix, or when the fix needs more than a standard change ([shift-discipline.md](../handbook/shift-discipline.md#4-the-escalation)).
- RMA candidate when: Xid 48/95/140/171 repeat or uncorrectable counters keep growing; row remap fails or keeps growing; Xid 79 repeats on the same GPU after reseat.
- Hand off to the application owner when step 13 shows that the Xid follows the job (Xid 13/31/43).
- Hand off to NVIDIA support for suspected library bugs (cuBLASLt `algoId 66` under MPS, cuDSS NaN, nvCOMP hang) with a minimal reproducer.
- Attach: `nvidia-bug-report.sh`, `dmesg -T` Xid lines, ECC/row-remap output, `dcgmi diag` results, `ipmitool sel list`, driver and toolkit versions (`nvidia-smi`, `nvcc --version`), and on Dell `racadm techsupreport`.

## 11. Customer message

> **SEV1/SEV2 template — GPU hardware fault:**
> "Job <job-id> on node <node-id> was stopped (or produced suspect output) because of a GPU error (Xid <code>) on that node. Hardware cause: <verified / not verified yet>. We are draining the node and moving your workload under ticket <ticket-id>. Jobs that used the node since <time> should <re-run from checkpoint / verify results>. Replacement hardware is <in progress / on order>. Next update by <time: the update interval of the priority, see shift-discipline.md>."

## Appendix A — Gaps & open questions

- `[GAP:G01]` No package/version query for CUDA libraries (cuBLASLt/cuDSS/nvCOMP versions). Ask the application owner for versions.
- `[GAP:G15]` No command to check the kernel-module flavor (open vs proprietary) for the DMA-BUF limitation. Owned by RB-05.
- Half-precision intrinsics (signature 44) have no node-level command beyond version collection; the fix is a toolkit/code change.

## Appendix B — Source trace

| Step / claim | Guide section | Gist / external |
|---|---|---|
| Steps 1-4 L1 gate | P (GPU health 1), R4, D (Xid 79) | L1 `dmesg -T`, `ipmitool`, `lspci -tv` |
| Steps 5-7 ECC/remap/power | D (Xid 48/63/64/94/95/171), §3 | L2 `nvidia-smi -q -d ...`; X28 (`-d POWER`) |
| Steps 8-9 DCGM | P (GPU health 3), §2, §3 | L2 `dcgmi health -c`, `dcgmi diag -r 1` |
| Step 10 NVLink | D (Xid 137/94), §8 | L3 `nvidia-smi nvlink -s`; X03 |
| Steps 11-12 library | §3, R5 | env `CUDA_MPS_ACTIVE_THREAD_PERCENTAGE` (guide §3); X21, X28 |
| Step 13 application-caused Xid; Xid 13/43/140 trigger rows | runbook catalogue G2, G5 | L1 `dmesg -T` |
| Section 9 shared procedure | safety checklist | `_shared/safety-checklist.md` (RB-08) |
| A2/A3/A7 | §3, §2 caveats | §10 `nvidia-smi -r`, `-pl`, reboot |
| A4 | P (GPU health) | L2 `dcgmi diag -r 3/-r 4` ("Drain first") |
