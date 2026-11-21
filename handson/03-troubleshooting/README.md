# H03 — Troubleshooting drills (break it / fix it)

**Why:** the fastest way to learn a diagnostic flow is to cause the symptom yourself.
Then work the same checklist that you would use on shift.
Source: the official [Troubleshooting](https://nvidia.github.io/k8s-test-infra/troubleshooting/) page, turned into drills.

**Concepts:** [CONCEPTS.md §3](../CONCEPTS.md#3-two-delivery-mechanisms--and-the-debugging-rule-that-follows-from-them) (the library-vs-shim debugging split).

## The universal first step

Before anything else, for any "this does not look right" symptom, run:

```bash
kubectl -n mokka exec "$POD" -- env MOCK_NVML_DEBUG=1 nvidia-smi
```

This traces every NVML call that the mock answers,
including which config file it loaded and how many devices it built.
Most of the drills below are answered by the first five lines of that output.

## Drill 1 — `nvidia-smi` in a pod reports no GPUs

**Cause it yourself:** deploy a plain pod with a hostPath mount to `/var/lib/nvml-mock`,
on a node that was never labelled `mokka.nvidia.com/type=sgpu`.
The chart's own DaemonSet tolerates all taints and needs no such label to run itself.
Several H05+ manifests use a `nodeSelector` on this label.
Remove or mislabel it, and their pods go `Pending`, which reveals the same diagnostic path.

**Diagnose:**

```bash
kubectl get pods -n mokka -l app.kubernetes.io/name=nvml-mock -o wide
kubectl logs -n mokka -l app.kubernetes.io/name=nvml-mock --tail=50
kubectl get nodes --show-labels | grep sgpu || echo "no node carries mokka.nvidia.com/type=sgpu"
```

**Fix:** `kubectl label node --all mokka.nvidia.com/type=sgpu` (see H05).

## Drill 2 — the device plugin reports 0 GPUs

Two causes.
Check in this order:

1. The mock files are not on the node.
   This is the same check as Drill 1.
2. The GPU Operator, if present, is trying to manage a *real* driver.
   It must be installed with `driver.enabled=false` and `toolkit.enabled=false`,
   since there is no real driver for it to manage (see H07).

```bash
kubectl -n gpu-operator logs -l app=nvidia-device-plugin-daemonset 2>/dev/null | head -20
```

## Drill 3 — a runtime change "does nothing"

**Cause it yourself:** on a multi-node cluster,
run `nvml-mock-ctl temp --gpu 0 90` against node A's pod.
Then read `nvidia-smi` from node B's pod.

**Diagnose:** overrides are per-node files (CONCEPTS.md §4).
Confirm that you targeted the node you meant to target:

```bash
kubectl get pods -n mokka -l app.kubernetes.io/name=nvml-mock -o wide
```

**Fix:** run the mutating command again against the correct node's pod (see [H02's helper script](../02-runtime-control/scripts/find-node-pod.sh)),
and allow ~1s for the TTL to expire.

## Drill 4 — a profile value does not show up in `nvidia-smi`

```bash
kubectl -n mokka exec "$POD" -- env MOCK_NVML_DEBUG=1 nvidia-smi 2>&1 | head -10
kubectl get configmap -n mokka -l app.kubernetes.io/name=nvml-mock
kubectl logs -n mokka -l app.kubernetes.io/name=nvml-mock | grep -i config
```

If the profile loaded, but the value is still not there, check precedence (H01).
A per-device override or a runtime override may be masking `device_defaults`.

## Drill 5 — macOS + Docker Desktop: `kind load docker-image` fails with "content digest not found"

This is specific to this machine's setup: Docker Desktop on macOS keeps multi-arch manifest lists.
It shows up the moment you try `BUILD_LOCAL=true` workflows in H08-H10.

**Reproduce:**

```bash
docker pull "ghcr.io/nvidia/nvml-mock:$MOKKA_VERSION"
kind load docker-image "ghcr.io/nvidia/nvml-mock:$MOKKA_VERSION" --name mokka
# ctr: content digest sha256:...: not found
```

**Fix:** save a single-platform archive, and load that instead:

```bash
./scripts/fix-multiarch-image.sh "ghcr.io/nvidia/nvml-mock:$MOKKA_VERSION" mokka
```

A locally built image, from `docker build`, single-arch by default, does not hit this at all.

## Drill 6 — fields show `N/A` or `NOT_SUPPORTED`

This is often correct behavior, not a bug.
The mock answers strictly from configuration,
so a field that the profile does not set is unsupported:
the same answer that an older real driver would give.
Add the value to the profile, and run `helm upgrade`, if you need it populated.

## Drill 7 — Xid catalog: which code means what, and how to practice reading them

`modules/m02-gpu-health-and-errors` already covers the real [Xid catalog](https://docs.nvidia.com/deploy/xid-errors/analyzing-xid-catalog.html) and its self-check:
which codes let you blame the workload, and which ones mean drain the node now.
This drill is the T0, no-hardware way to *generate* Xid signals yourself,
instead of only reading canned `dmesg` extracts.

**A training subset of the real catalog** (see the official catalog for the authoritative, versioned list):

| Xid | Real meaning | Triage class | Closest `nvml-mock-ctl` injection |
|----:|---|---|---|
| 13 | Graphics Engine Exception | Usually workload/driver — one app's fault, GPU stays up | *(see note below — not directly injectable)* |
| 31 | GPU memory page fault | Usually workload — illegal memory access by the app | *(see note below — not directly injectable)* |
| 43 | GPU stopped processing | Usually workload — recoverable via reset | *(see note below — not directly injectable)* |
| 48 | Double Bit ECC Error | Hardware — device stays addressable, counters climb | `fail --gpu N --mode ecc_uncorrectable --xid 48` |
| 63 / 64 | Row-remapping pending / failure | Hardware — schedule maintenance, may need reset | `fail --gpu N --mode ecc_uncorrectable --xid 64` |
| 74 | NVLink Error | Hardware/fabric | see [H02 §6](../02-runtime-control/README.md#6-nvlink-and-sram-ecc-error-injection)'s `nvlink-error` command instead — it is the more accurate mock surface for this one |
| 79 | GPU has fallen off the bus | Hardware, critical — drain the node immediately | `fail --gpu N --mode fallen_off_bus --xid 79` |
| 94 / 95 | Contained / uncontained ECC error | Hardware — uncontained (95) usually forces a reset | `fail --gpu N --mode lost --xid 95` |

**Be honest about the gap while you run this:** Mokka's `fail` command has only three modes:
`ecc_uncorrectable`, `lost`, and `fallen_off_bus` (see [H02](../02-runtime-control/README.md)).
The Xid *number* is only a label that you attach to whichever mode you trip.
The mock does not give codes like 13, 31, or 43 their own distinct,
workload-only, device-stays-healthy behavior, because that behavior is not one of the three modes.
Pairing 48, 64, 79, and 95 above with their real-world mode is a faithful match.
Codes like 13, 31, or 43 cannot be faithfully reproduced with this tool at all.
Their real-world signature is "app crashes,
GPU keeps running fine," which none of Mokka's three failure modes represent.
This is exactly the limit that `plan/learning-hardware.md` calls out:
the drill trains the reading of the signal and the reaction to it, not the cause.

**Run it:**

```bash
./scripts/inject-xid-catalog.sh mokka
```

This injects the 4 injectable rows above, onto GPU indices 0-3 of the same pod.
Then classify each one blind, the way that M2's lab does with real `dmesg` extracts:

```bash
kubectl -n mokka exec "$POD" -- nvidia-smi \
  --query-gpu=index,ecc.errors.uncorrected.aggregate.total,temperature.gpu \
  --format=csv
kubectl -n mokka exec "$POD" -- dmesg | grep Xid || true   # needs nodeAgent.kernelLog.enabled=true, see H02 §5
```

For each GPU, check whether it is still addressable.
Check whether an aggregate counter shows hardware damage accruing,
or whether every guarded call now errors out.
Match what you see to the table above, and then to M2's workload/reset/reboot/RMA classification.
Do this **before** you look at the script's own comments, which name the code for each index.

**Clean up:**

```bash
kubectl -n mokka exec "$POD" -- nvml-mock-ctl reset
```

## Self-check

- For "wrong `nvidia-smi` output" versus "wrong `lspci`/`ibstat` output," where do you look first, and why?
- Name the one command that tells you whether your profile loaded,
  and with how many devices, before you check anything else.
- Why can Mokka not faithfully reproduce Xid 13, 31, or 43?

Check your answers in [the Self-check answers](../self-check-answers.md#h03).

Next: [H04 — Node Daemon & Libraries/Shims deep-dive](../04-node-daemon-and-shims/README.md)
