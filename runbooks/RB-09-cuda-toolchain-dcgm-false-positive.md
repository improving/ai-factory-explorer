---
id: RB-09
title: CUDA toolchain errors and DCGM health false-positives
owner_layers: [L1, L2]
severity:
  default: SEV3
  escalate_to: "SEV2 only if the false-positive test fails and a real hardware signal is found (then hand off)"
signatures: [97, 98, 99, 100, 101]
guide_refs: ["§2 (CUDA)", "G summary row 3 (CUDA toolchain note)"]
gist_refs: ["L1", "L2", "L3", "§9"]
related:
  upstream: [RB-03, RB-01]
  downstream: [RB-03, RB-01]
  lookalike: [RB-01, RB-03]
gaps: [G01, G12]
---

# RB-09 — CUDA toolchain errors and DCGM health false-positives

**Purpose: a stop-and-confirm runbook.** These signatures sound like hardware or fabric faults but are usually not. Prove it in two commands, then close or hand off.

## 1. Trigger

| # | Signature (verbatim) | Decoder meaning |
|---|---|---|
| 97 | `nvlink fatal : Could not open input file '/usr/lib/x86_64-linux-gnu/librt.a'` | **CUDA linker (`nvlink`), not the NVLink fabric.** A missing static library at build time (guide: install `libc6-dev`/`librt.a` or use a different toolchain image). |
| 98 | `DCGM 4.7.0 reports Power Health Warning on one L40S` | *Outside this fleet (L40S).* DCGM power-health verdict that may not match reality; confirm with `nvidia-smi` and BMC sensors. The same test applies to a DCGM power warning on B200/B300 (signature 101). |
| 99 | `crt/host_config.h: No such file or directory` (CUDA 13.0 on GitHub Actions windows-2025) | *Outside this fleet (GitHub Actions windows-2025).* Not a node problem: a CI/toolchain install problem; Windows CI is outside node ops. |
| 100 | `cicc dies with SIGILL lowering __nvvm_atom_add_gen_d for sm_120` | *Outside this fleet (`sm_120` is not the B200/B300 target).* Not a node problem: a compiler bug for a specific target. |
| 101 | DCGM power-warning that looks like a thermal/power fault (look-alike case of 98) | Same test as 98. |

## 2. Impact and blast radius

- **Severity:** SEV3 by default. If the "is it really hardware?" test fails, hand off to RB-03 or RB-01 at their severity.
- **Priority:** SEV3 is P3 in the P1 to P4 table of [shift-discipline.md](../handbook/shift-discipline.md#1-the-priority): no node or job impact; P4 for a toolchain or CI question.
- **Blast radius:** none for the false-positive and toolchain cases — they are build-time or monitoring artifacts, and no node or job action is needed. If the test fails and a real fault is confirmed, the blast radius is the receiving runbook's: one GPU/node (RB-03) or one NVL72 domain (RB-01).

## 3. First 5 minutes

1. `nvidia-smi` `[C:L2]` — expected: driver version consistent; no throttle reason; power within cap.
2. `dcgmi health -c` `[C:L2]` — expected: verdict matches the hardware steps (healthy); "no data" is not "healthy" (watches not set, see step 6).
3. `dmesg -T | grep -iE 'Xid|NVRM|thermal|throttl|PSU'` `[C:L1]` — expected: no thermal, power, or Xid events.

Dashboards to open: the Grafana GPU dashboard (dcgm-exporter) for the node — temperature, power, throttling — and the BMC sensor view, to check the DCGM warning against independent sources.

**Who runs it:** L1 runs steps 1, 2, and 3 (read-only; [l1-primer.md](../handbook/l1-primer.md)). Setting the DCGM health watches and every node action are L2.

## 4. Hardware variants

Row names follow [hardware-matrix.md](../handbook/hardware-matrix.md), Table 2. The AMD column is the catalog's G10 mapping (driver/CUDA/firmware mismatch).

| | Hopper HGX (H100/H200) | Blackwell HGX (B200/B300) | NVL72 rack (GB200/GB300) | AMD Instinct (MI300X/MI350X/MI355X) |
|---|---|---|---|---|
| Management CLI | `nvidia-smi` | same | same | `amd-smi` (`rocm-smi` on older fleets) |
| Health and diagnostics | DCGM, `dcgmi health -c`, `dcgmi diag` levels 1-4 | same | same | ROCm Validation Suite; no DCGM — a DCGM power warning cannot occur; the analogous verdict comes from `amd-smi metric` |
| Compatibility authority | driver/CUDA matrix | same | same | the ROCm compatibility matrix |
| Prometheus exporter | `dcgm-exporter` | same | same | AMD Device Metrics Exporter |

## 5. Decision table

The hardware gate comes first, as in every runbook.

| # | Layer | Command | Good looks like | Bad looks like | Next |
|---|---|---|---|---|---|
| 1 | L1 | `dmesg -T \| grep -iE 'Xid\|NVRM\|thermal\|throttl\|PSU'` `[C:L1]` | No thermal, power or Xid events | Thermal/power/Xid lines | Real signal: RB-03 |
| 2 | L1 | `ipmitool sensor` `[C:L1]` | Temps, fans, PSU voltages in range | Alarm | Real signal: RB-03 (power/thermal) |
| 3 | L1 | `ipmitool sel list` `[C:L1]` | No PSU/thermal events | Events | Real signal: RB-03/RB-05 |
| 4 | L1 | For the linker/compiler messages: `nvcc --version` `[X:28]`, `ldd --version` `[X:28]` | Toolkit and glibc versions as expected; the message is reproducible at build time only | n/a | Fix the build image/toolchain (Repair A2); no node action |
| 5 | L2 | `nvidia-smi` and `nvidia-smi -q` `[C:L2]` | Driver version consistent; no throttle reason; power within cap | Throttling, "ERR!", missing GPU | RB-03 |
| 6 | L2 | `dcgmi health -c` `[C:L2]`. It returns data only after the health watches are set: `dcgmi health -s a` `[R]` (L2) | Verdict matches the hardware steps 1-3 and 5 (healthy) | DCGM warns on power but steps 1-3 and 5 are clean; or no data (the watches are not set: "no data" is not "healthy") | **False positive**: Mitigation A1 (record, no hardware action). No data: set the watches, wait, check again. If DCGM fails and any hardware step also fails: RB-03 |
| 7 | L2 | `dcgmi diag -r 1` `[C:L2]` | Pass | Fail | RB-03 |
| 8 | L3 | `nvidia-smi nvlink -s` and `systemctl status nvidia-fabricmanager` `[C:L3]` (for the `nvlink fatal` message) | Links active, FM `active (running)` | Links down, FM failed | The fabric is faulty independently of the linker message: RB-01 |

**Who runs it:** L1 may run steps 1, 5, 6, and 8 (read-only). All other steps are L2 or L3.

### Read-only diagnostics (by layer)

| Layer | Command | Tag | Look for |
|---|---|---|---|
| L1 | `dmesg -T \| grep -iE 'Xid\|NVRM\|thermal\|throttl\|PSU'`, `ipmitool sensor`, `ipmitool sel list` | `[C:L1]` | Real hardware events |
| L1 | `nvcc --version`, `ldd --version`, `ldconfig -p` | `[X:28]` | Toolchain and library presence |
| L2 | `nvidia-smi`, `nvidia-smi -q`, `nvidia-smi -q -d POWER` | `[C:L2]`, `[X:28]` | Power draw vs cap, throttling |
| L2 | `dcgmi health -c`, `dcgmi diag -r 1` | `[C:L2]` | DCGM verdict (`dcgmi health -c` needs the health watches; "no data" is not "healthy") |
| L3 | `nvidia-smi nvlink -s`, `systemctl status nvidia-fabricmanager` | `[C:L3]` | Fabric health (to prove the linker message is unrelated) |

### Differential diagnosis

| Looks like | How to tell | Go to |
|---|---|---|
| NVLink fabric failure | Fabric/FM errors at runtime (`Cuda failure 802`), `nvidia-smi nvlink -s` bad; `nvlink fatal :` appears only in the **build** output | RB-01 |
| Real GPU power/thermal fault | `ipmitool sensor` alarm, throttle reason in `nvidia-smi -q`, events in `dmesg` | RB-03 |
| PSU/BMC policy conflict | DPS/PSU policy error | RB-08 |
| Silent wrong results from CUDA intrinsics | Wrong values at runtime without build errors | RB-03 (signature 44) |
| Driver/DMA-BUF limitation | `DMA-BUF not supported` | RB-05 |
| Xid 13, 31, 43 that follow the job (application-caused, catalogue G5) | The same Xid on a different node with the same job | RB-03 |

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

Most outcomes here need **no** node state change. The rows below are the only ones.

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A1 | Close a DCGM false-positive | (no state change; record steps 1-6 outputs in the ticket) | **L2.** All hardware steps clean (1-3 and 5); `dcgmi health -c` `[C:L2]` returned data (watches set) | None | n/a |
| A3 | Cap GPU power while a real thermal cause is fixed `[C:§10]` | Read the default first: `nvidia-smi -q -d POWER` `[X:28]` ("Default Power Limit"); then `nvidia-smi -pl <watts> -i <gpu>` | **L2.** Only if steps 1-3 and 5 show a real thermal issue; this is then an RB-03 case, and RB-03 A3 owns the power cap. The default power limit and the ticket are recorded; the job owner agrees | Lower GPU performance | `nvidia-smi -pl <default> -i <gpu>` `[C:§10]`; record it in the ticket |

## 7. Repair

| ID | Action [tag] | Command | Before you run it | Impact | Undo |
|----|--------------|---------|-------------------|--------|------|
| A2 | Fix the build/toolchain image (linker/compiler messages) `[GAP:G01]` | (no command text: install the missing static library such as `librt.a` from `libc6-dev`, or use another toolchain image, per the guide) | **L2.** `nvcc --version`, `ldd --version` `[X:28]` read; build owner informed | Build environment only; **no node impact** | Revert the image/package change |

## 8. Evidence to collect

Evidence to capture: `dcgmi health -c`, `nvidia-smi -q`, `ipmitool sensor`, `dmesg -T` output, DCGM version (`dcgmi` version output `[GAP:G01]`), build log for toolchain errors.

## 9. Return to service

Verify:
1. For a linker message: the rebuild succeeds; `nvidia-smi nvlink -s` and `systemctl status nvidia-fabricmanager` were healthy throughout.
2. For a DCGM warning: `dcgmi health -c` `[C:L2]` verdict (with the health watches set) recorded next to clean `nvidia-smi -q`, `ipmitool sensor`, `dmesg -T` outputs; the warning is documented as a false positive.

## 10. Escalation

- **Internal:** L1 hands over to L2 at the end of section 3 with no fix, at once for P1 and P2. L2 hands over to L3 when the runbook ends with no fix, or when the fix needs more than a standard change ([shift-discipline.md](../handbook/shift-discipline.md#4-the-escalation)).
- If the false-positive test fails (a real hardware signal exists): hand off to RB-03 (power/thermal) or RB-01 (fabric) with the evidence above.
- For a persistent DCGM power-warning with clean hardware: report to NVIDIA (DCGM) with DCGM version, GPU model (L40S in the guide), `nvidia-smi -q`, and BMC sensor readings.
- Compiler SIGILL / CI header issues: toolchain owners / NVIDIA CUDA forum, not an SRE node action.

## 11. Customer message

> **Close-out template — false positive (usually no customer message is needed):**
> "The <DCGM power warning / reported toolchain error> on <node-id> was investigated and is a monitoring/build artifact, not a hardware fault (ticket <ticket-id>). No action is needed and no jobs were affected."
>
> **Hand-off template — the test failed:**
> "The reported fault on <node-id> was confirmed as a real <power/thermal/fabric> issue. We are handing over to the hardware/fabric procedure under ticket <ticket-id>; impact and next steps follow from <RB-03/RB-01>. Next update by <time: the update interval of the priority, see shift-discipline.md>."

## Appendix A — Gaps & open questions

- `[GAP:G01]` No package/version query for DCGM or the CUDA toolkit packages beyond `nvcc --version`.
- `[GAP:G12]` Windows CI (`crt/host_config.h`) and `cicc` SIGILL on `sm_120` have no node-level command; they are toolchain/CI bugs.
- Whether a given DCGM release has a fix for the L40S power warning is not in the sources.
- This runbook does not cover application-caused Xid 13, 31, 43 (catalogue G5); RB-03 does.

## Appendix B — Source trace

| Step / claim | Guide section | Gist / external |
|---|---|---|
| Steps 1-3 | §2 diagnostics 3 (`dmesg`), §2 (DCGM power) | L1 `dmesg`, `ipmitool` |
| Step 4 | §2 (`libc6-dev`/`librt.a`) | X28 |
| Steps 5-7 | §2 diagnostics 1-2 | L2 `nvidia-smi`, `dcgmi health -c`, `dcgmi diag -r 1`; DCGM user guide (`dcgmi health -s a`) |
| Step 8 | §2 ("CUDA linker, *not* NVLink fabric") | L3 |
| A3 | §2 state-changing (`nvidia-smi -pl`) | §10; RB-03 A3 owns the power cap |
