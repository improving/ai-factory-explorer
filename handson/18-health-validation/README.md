# H18 — health-validation: the node verdict

**Why:** an engineer reads an Xid and decides: workload, reset, reboot, drain, or RMA.
That decision is now a published check catalogue with a machine-readable verdict.
This lab reads the verdict, compares it with your own decision, and shows where the two differ.

**Serves:** M2 (the verdict block), M10 (the return-to-service gate).
**Cluster:** none. A laptop with Go; a GPU node is optional.
**Time:** 30 minutes.

## Concepts

- **The verdict is a contract.** One JSON object per node: `overall_severity`, `severity_by_domain`, `affected_components`, `check_results`, and `skipped_checks`.
  `schema_version` and `catalog_version` say which rules produced it.
- **Five severities.** `PASS`, `INFO`, `WARNING`, `CRITICAL`, and `UNKNOWN`.
  `UNKNOWN` is not a soft `PASS`: the check could not complete, so eligibility is not assessed.
  A skipped check is a separate state, and it does not change the verdict.
- **The recommended action.** A failing check carries `recommended_action.operational_state` and `remediation_actions`.
  The operator reads the action; the operator still owns the decision.
- **The execution context.** `OPERATOR_INFRA`, `TENANT_GUEST`, or `OUT_OF_BAND`.
  On a laptop with no BMC and no driver, many checks cannot run.
  That is the lesson: read `skipped_checks` before you read `overall_severity`.
- **The exit code is coarse.** `0` is `PASS`, `INFO`, or `WARNING`; `1` is `CRITICAL` or `UNKNOWN`; `2` means that no verdict was produced.

## Prerequisites

| Requirement | Check |
|---|---|
| Go, the version in `go.mod` | `go version` |
| `jq` | `jq --version` |
| Optional: a GPU node | for the `T2` part |

```bash
export HEALTH_VALIDATION_VERSION=toolkit/v0.3.1   # the toolkit tag
```

## Part A — build and collect

```bash
git clone --branch toolkit/v0.3.1 https://github.com/dsx-ai-factory/health-validation.git
cd health-validation
go build -o health-validation ./toolkit/cmd/health-validation
./health-validation --help
```

Collect the raw measurements without evaluating them.

```bash
./health-validation collect > observations.json
jq 'keys' observations.json
```

**Expected:** one `ObservationBatch` with one observation for each signal.
On a laptop, some signals are `noValue` with `NO_VALUE_REASON_NOT_SUPPORTED`.
That is not zero, and it is not a fault.

## Part B — the verdict on a laptop

```bash
./health-validation run > verdict.json; echo "exit=$?"
jq '{overall_severity, severity_by_domain, skipped_checks}' verdict.json
```

**Expected:** `overall_severity` is `UNKNOWN` or `WARNING`, and `skipped_checks` is not empty.
The exit code is `1` for `UNKNOWN`.

Now answer these three questions from the JSON alone:

1. Which checks ran, and which were skipped?
2. Which check produced the worst severity?
3. Does any check give a `recommended_action`? If not, why not?

This is the discipline: a `UNKNOWN` verdict from a context that cannot see the hardware must not drain a node, and it must not pass it either.

## Part C — the two example verdicts

The README has two examples: a clean node, and a node with Xid 79 and a missing GPU.
Read them and fill this table.

| Field | Clean node | Xid 79 node |
|---|---|---|
| `overall_severity` | | |
| `severity_by_domain` | | |
| `affected_components` | | |
| the check that failed | | |
| `recommended_action.operational_state` | | |
| `remediation_actions` | | |

Then answer: the Xid 79 node also fails `gpu_count`.
Which of the two failures drives the action, and how do you know?

## Part D — change one threshold

Find the threshold of the `gpu_count` check.

```bash
grep -rn "expected_gpu_count" catalog/ | head
sed -n '1,60p' toolkit/app/config.go
```

The config maps each check ID to its threshold names; there is no nested `thresholds:` key.

```yaml
# operator.yaml
checks:
  gpu_count:
    expected_gpu_count: 8
```

```bash
./health-validation run --config operator.yaml | jq '.check_results[] | select(.check_id=="gpu_count")'
```

**Expected:** the check reports the value that you set, and `thresholds.<name>.overridden` is `true`.
If your file shape is rejected, read the error and the check definition again.
This is the same rule as M2: the site owns the threshold, and it records the difference.

Add a second rule that the site needs: disable one check that does not apply to your fleet.

```yaml
disabled_checks:
  - gpu_power_state
```

**Expected:** the check is reported as skipped with `CheckDisabled`, and it does not change the node severity.

## Part E — the Slurm prolog

The project ships a prolog example.
It drains the node when the exit code is `1`, and it reads `overall_severity` for the reason.

```bash
sed -n '/Slurm prolog/,/^```$/p' README.md | head -30
```

Write the prolog for your site.
Add one rule that the example does not have: do not drain when every failing check is `UNKNOWN` and the node is in a maintenance window.
Explain the rule in one sentence.

## Part F — optional, a GPU node (T2)

On a node with a driver, run the same commands with the operator context.

```bash
./health-validation run --execution-context OPERATOR_INFRA --cadence PROLOG > gpu-verdict.json
jq '{overall_severity, severity_by_domain, affected_components}' gpu-verdict.json
```

**Expected:** the GPU, NVLink, and Xid checks run.
Compare the check list with the laptop run, and list the checks that the context added.

## Troubleshooting

| Symptom | Cause | Check |
|---|---|---|
| `go: cannot find main module` | You are not in the repository root | `pwd`, `ls go.mod` |
| The build asks for a newer Go | `GOTOOLCHAIN` is set to `local` | `go env GOTOOLCHAIN`; let it download the pinned toolchain |
| Every check is skipped | The context cannot see the source | `--execution-context`, and the sensor error in `collect` |
| The config is rejected | The key names are wrong | the check definition from the grep |

## Cleanup

```bash
cd .. && rm -rf health-validation observations.json verdict.json operator.yaml
```

## Self-check

A node returns `CRITICAL` from `gpu_xid_79` with `operational_state: drain`, and `UNKNOWN` from `nvlink_fabric` because the check could not run.
What do you do, and what do you record?
(A `CRITICAL` with a drain action is a drain. The `UNKNOWN` does not block the action; it limits the claim that you can make about the fabric, and it goes in the ticket. Then follow RB-03 for the Xid, and RB-01 for the fabric when the node is out of service.)
