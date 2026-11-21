---
id: RB-12
title: Host not allocatable - lifecycle state, health classification, SKU, or firmware baseline
owner_layers: [L1, L2, L4]
severity:
  default: SEV3
  escalate_to: "SEV2 when a whole rack or node pool cannot be allocated; SEV1 when a released host may still reach a tenant network"
signatures: [106, 107, 108, 109]
guide_refs: ["§1", "D (Platform / power / policy messages)"]
gist_refs: ["L1", "L7"]
related:
  upstream: [RB-08, RB-05]
  downstream: [RB-05, RB-06, RB-10]
  lookalike: [RB-08, RB-03]
gaps: [G13, G14, G15]
---

# RB-12 — Host not allocatable: lifecycle state, health classification, SKU, or firmware baseline

This runbook owns the **"the host is powered, reachable, and has no tenant, but no instance can use it"** ticket.
It is the NICo view of the host.
It does not own a broken DPU ([RB-06](RB-06-bluefield-dpu-boot-mlx5-eswitch.md)), a firmware regression ([RB-05](RB-05-firmware-driver-bmc-bios-dkms-doca.md)), or a leak ([RB-10](RB-10-facility-cooling-power-emergency.md)).

## 1. Trigger

| # | Signature (verbatim) | Decoder meaning |
|---|---|---|
| 106 | Instance creation fails; the machine health carries `PreventAllocations` | The host is blocked by a health classification. The power state and the network are not the cause. |
| 107 | The machine state is `Quarantined` or `Failed`, or the firmware differs from the site baseline | A Day 0 or Day 2 gate failed. The host is held until the baseline is met. |
| 108 | A released host still appears in the tenant network, or the release does not complete | The network cleanup has not converged. This is a security event, not only a capacity event. |
| 109 | SKU validation fails: a missing or an unexpected component | The machine does not match its bill of materials. |

**Where each signature starts in section 5:**
106 → decision step 2. 107 → step 3. 108 → step 5 (security path). 109 → step 4.

## 2. Impact and blast radius

- **Severity:** SEV3 by default (one host is not allocatable).
  SEV2 when a rack or a node pool cannot be allocated.
  SEV1 for signature 108: a released host may still reach a tenant network.
- **Priority:** P3 by default; P2 for a rack; P1 for signature 108.
- **Blast radius:** one host; one rack when a baseline or a switch is the cause; one tenant when signature 108 applies.

## 3. First 5 minutes

1. `nicocli machine get <machine-id> -o json > machine.json` `[C:L7]` — expected: `state`, `health`, `skuValidation`, and the firmware inventory in one record.
2. `jq '{state, health}' machine.json` `[C:L7]` — expected: the classification. `PreventAllocations` explains the failed instance request.
3. `jq '.health.alerts[] | {id, target, classification}' machine.json` `[C:L7]` — expected: the probe id and the target, for example a sensor or a DPU agent check.

Dashboards to open: the NICo host health panels (`carbide_hosts_unhealthy_by_classification_count`, `carbide_machines_per_state`) and the site's BMC dashboard.

**Who runs it:** L1 runs steps 1 to 3 (read-only). A state change, a firmware action, or an override is L2 or L4.

## 4. Hardware variants

| Fleet | Difference |
|---|---|
| HGX B200/B300, air-cooled | The BMC and the UEFI are the only out-of-band sources. A fan or a PSU sensor is a common cause of `PreventAllocations`. |
| GB200/GB300 NVL72 | The rack and the NVL domain are first-class. A leak, a power anomaly, or a degraded NVLink fabric blocks allocation at the rack level, and Flow sequences the recovery. |
| Zero-DPU host | The DPU policy is `ignore` or `nic`; the tenant isolation comes from the fabric, so a network cleanup fault is a switch or VPC question, not a DPU question. |
| AMD Instinct | The same lifecycle model; the GPU health probes come from `amd-smi` and sysfs instead of NVML. |

## 5. Decision table

| # | Observation | Conclusion | Next action |
|---|---|---|---|
| 1 | The machine is in maintenance | An operator set it, and the state-machine SLA is suppressed on purpose | Confirm the owner and the end time. Do not clear it. |
| 2 | `PreventAllocations` from a sensor class (`SensorCritical`, `SensorFatal`, `SensorFailure`) | A hardware reading is out of range | Open the BMC sensor, compare with the peer hosts, and follow RB-05 or the OEM case. Mitigation A1 |
| 3 | `PreventAllocations` from `Hardware` or a DPU probe | A hardware or DPU fault | RB-06 for the DPU; the OEM case for the rest. Mitigation A1 |
| 4 | `PreventAllocations` from `TrayLeak` or `RackLeak` | A leak | Stop. Follow [RB-10](RB-10-facility-cooling-power-emergency.md). Do not clear the classification. |
| 5 | Signature 108: the host still reaches a tenant network after release | The convergence gate failed, and isolation is not proven | Treat it as a security event: isolate the host at the DPU or the switch, open the incident, and keep the host out of the pool. Mitigation A4 |
| 6 | The state is `Quarantined`, and the firmware differs from the baseline | The Day 0 or Day 2 baseline gate failed | Run the firmware update through Flow on the unoccupied host. Mitigation A2 |
| 7 | SKU validation fails on one component | The machine does not match its bill of materials | Record the component, open the OEM or the parts case, and do not assign the SKU. Mitigation A3 |
| 8 | The state is `Repairing`, and the instance is still assigned | Online repair is in progress | Wait, or escalate the repair; do not force a release. Mitigation A5 |
| 9 | The state is `Ready`, the health is clean, and the instance still fails | The block is above NICo (quota, VPC, or the platform) | RB-11 for the quota; the tenant network configuration for the VPC. |

## 6. Mitigation

| # | Action | Before you run it | Impact | Undo |
|---|---|---|---|---|
| A1 | Clear a health override, or set the host to maintenance while you work | **L2.** The owner of the host agrees; a cleared override returns the host to allocation | The host may receive a tenant before the repair is done | Re-apply the override |
| A2 | Update the firmware to the site baseline through a Flow operation run | **L4.** The host is unoccupied; the operation rule and the phase plan are approved; a rollback image exists | The host reboots out of band; no tenant is affected | Re-run the previous baseline |
| A3 | Assign or correct the SKU, then force a revalidation | **L2.** The bill of materials is confirmed by the supplier | The machine becomes valid or stays quarantined with a clear reason | Remove the assignment |
| A4 | Isolate the host at the DPU or the switch, and open a security incident | **L3.** Incident commander and security owner; evidence is captured first | The tenant loses the host; the isolation is proven | Restore the isolation only after the gate passes |
| A5 | Release the instance for a full repair, and let a repair tenant claim the machine | **L2.** The tenant agrees; the online repair is cleared first | The tenant loses the instance; the machine is cleaned and quarantined | Re-provision the instance |

## 7. Repair

1. **The gate that failed is the repair target.** A sensor, a firmware baseline, a SKU, or a DPU. Do not clear the classification to make the host allocatable; fix the gate.
2. **Use the repair workflow, not a manual state change.** Online repair keeps the instance; full repair releases it; the repair tenant claims the machine with a targeted instance.
3. **Record the outcome label.** A failed online repair is labelled before the escalation, so the failure stays visible.
4. **Update the record.** The CMDB entry, the firmware inventory, and the machine labels must agree after the repair.

## 8. Evidence to collect

- The machine JSON before the change: state, health, SKU, firmware.
- The BMC sensor log and the SEL for a hardware classification.
- The Flow operation run and its task log for a firmware action.
- The DPU state and the network cleanup result for signature 108.

## 9. Return to service

- [ ] The classification that blocked the host is gone, and the reason is recorded.
- [ ] The firmware matches the site baseline, or the difference is an approved exception.
- [ ] The SKU validation passes.
- [ ] For a released host: the DPU confirms that it left every tenant network, and the convergence gate passed.
- [ ] An instance creation succeeds on the host.
- [ ] The machine labels and the CMDB record agree.

## 10. Escalation

- L1 → L2 at the end of section 3.
- L2 → L4 for a firmware baseline or a hardware repair.
- L2 → the OEM for a component, with the BMC SEL, the machine JSON, and the SKU result.
- Signature 108 → the incident commander and the security owner at once.

## 11. Customer message

> One host in your pool is out of service for <reason>.
> Your other instances are not affected.
> We expect it back at <time>, or we will move your allocation to another host.

For signature 108, do not send a capacity message. Send the security process message, and do not claim that no data was exposed until the evidence says so.

## Appendix A — Gaps & open questions

- `[GAP:G13]` The exact JSON path of the health alerts and the classification list differs between NICo versions. Confirm it on v2.2.2 with `jq 'paths' machine.json`.
- `[GAP:G14]` The `nicocli` action names for maintenance and override are generated from the OpenAPI spec. Record the names from `nicocli machine --help` on the pinned version.
- `[GAP:G15]` The Flow CLI command names are documented in the Flow guide, not in the REST reference. Add the exact command after the first lab run.

## Appendix B — Source trace

| Section | Source |
|---|---|
| Lifecycle and states | NICo, `docs/overview/lifecycle.md` |
| Health classifications | NICo, `docs/architecture/health/health_alert_classifications.md` |
| Health metrics | NICo, `docs/operations/monitoring-health.md` |
| Repair workflows | NICo, `docs/manuals/repair/overview.md` |
| Network cleanup and the convergence gate | NICo, `docs/operations/tenant-lifecycle-cleanup.md` |
| Flow | NICo, `docs/operations/flow/overview.md` |
| Commands | `nicocli` reference; the NICo REST API reference |
