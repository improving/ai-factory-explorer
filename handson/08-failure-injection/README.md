# H08 — Failure Injection demo

**Why:** this lab runs NVIDIA's official end-to-end failure-injection walkthrough.
It exercises every supported failure mode against `nvidia-smi` with automated assertions.
This is a more rigorous version of what you did by hand in [H02](../02-runtime-control/README.md).

**Concepts:** [CONCEPTS.md §7](../CONCEPTS.md#7-faq-facts-worth-memorizing-before-you-hit-them-as-bugs) (failure is configuration,
and every surface agrees on it).

## Prerequisites

You need a clone of the repository (its `run.sh` runs from a checkout,
not a published chart), and either your existing `mokka` cluster's context,
or `BUILD_LOCAL=true` for a fully isolated throwaway cluster:

```bash
git clone --branch v0.4.0 https://github.com/NVIDIA/k8s-test-infra.git ~/mokka-src
kubectl config current-context   # confirm which cluster you're about to point this at
```

## Option A — run against your existing cluster

```bash
# installs a *separate* release "nvml-mock-failure" into namespace "mokka-failure",
# distinct from the quick-start's "nvml-mock" in "mokka" — but see the warning below.
# NVML_MOCK_IMAGE pins the image; the script's own default is nvml-mock:latest.
NVML_MOCK_IMAGE="ghcr.io/nvidia/nvml-mock:${MOKKA_VERSION:?see handson/README.md#pinned-versions}" \
  ~/mokka-src/docs/guides/failure-injection/run.sh
```

> **Do not point `NAMESPACE=` at another Mokka release's namespace.**
> The demo refuses to install if another Mokka release already exists anywhere on the cluster (exit code `4`),
> because **both DaemonSets mount the same hostPaths** (`/var/lib/nvml-mock`,
> `/var/run/cdi`, `/run/nvidia`, the NFD features directory), regardless of release name or namespace.
> A co-located run was measured to leave the shared `config.yaml` reading `failure: {mode: fallen_off_bus, ...}`.
> This is invisible to both demos' own pods, because each mounts its own ConfigMap,
> but it is **not** invisible to any real GPU workload also scheduled on that node.
> `DEMO_ASSUME_YES=true` overrides the refusal; do not use it without care.

The script also **fails closed** against anything that is not an obviously throwaway `kind-*` context.
A non-interactive run against a real cluster exits `4` rather than installing unattended.

## Option B — fully isolated, own cluster

```bash
BUILD_LOCAL=true ~/mokka-src/docs/guides/failure-injection/run.sh   # builds the image from the v0.4.0 checkout
```

This builds the image from source and creates its own `nvml-mock-failure-demo` kind cluster.
The first run on a cold image cache is slow.
A measured cold pull took about 8 minutes per node, so the script waits up to 15 minutes.
Raise the budget further on a slow link with `HELM_TIMEOUT=30m ~/mokka-src/docs/guides/failure-injection/run.sh`.

## What the script does

The script re-deploys the chart between four scenarios with `helm upgrade --reuse-values`,
so only the failure-injection knobs change.
It asserts against `nvidia-smi` output each time:

1. **Healthy baseline** — no `failure:` block, `nvidia-smi -L` lists every GPU,
   aggregate uncorrectable ECC counter starts at 0.
2. **`ecc_uncorrectable` + Xid 79** — device stays addressable (`nvidia-smi -L` still lists every GPU),
   but `ecc.errors.uncorrected.aggregate.total` is now strictly positive.
3. **`lost`** — every guarded NVML call after the first now errors (`temperature.gpu` shows `[N/A]` or `[Unknown Error]` instead of an integer).
4. **`fallen_off_bus` + Xid 79** — same NVML surface as `lost`, plus the Xid queued for the event set.

## Caveats worth internalizing

- **The Xid event is delivered through the NVML event set, not `nvidia-smi` text.**
  `nvidia-smi` never subscribes to `nvmlEventSetWait`, so it never prints "Xid 79" itself.
  Real consumers see it via the device plugin's health monitor,
  `dcgm-exporter`'s `DCGM_FI_DEV_XID_ERRORS` metric,
  or a small Go program that calls `nvml.EventSetCreate`/`RegisterEvents`/`EventSetWait`.
  To see a real, standalone `dcgm-exporter`/`dcgmi` reading Mokka directly (temperature and power,
  verified live; ECC/Xid fields follow the same path), see [H11](../11-dcgm-nvlink-fabric/README.md).
- **The injector's call counter is per-process and per-device.**
  Each `kubectl exec ... nvidia-smi` is a fresh process with a fresh counter.
  A threshold has to be met inside one invocation.
  This is why all three fault scenarios use `after_calls: 1`.
  For interactive exploration of a climbing counter,
  use a long-running query instead of one-shot invocations:

  ```bash
  kubectl exec -it "$POD" -- nvidia-smi \
    --query-gpu=index,ecc.errors.uncorrected.aggregate.total \
    --format=csv -l 1
  ```

## Clean up

```bash
# Default path — the -n and --kube-context are load-bearing; without them helm
# resolves the release from whatever context/namespace happens to be current,
# which on a shared cluster is how this can delete another Mokka release.
helm uninstall nvml-mock-failure -n mokka-failure --kube-context <your-context>

# BUILD_LOCAL=true path:
kind delete cluster --name nvml-mock-failure-demo
```

## Self-check

- Why does Scenario 2 (`ecc_uncorrectable`) still list every GPU in `nvidia-smi -L`,
  while Scenario 3 (`lost`) does not?
- You want to verify an injected Xid programmatically.
  Why does grepping `nvidia-smi` output not work?

Check your answers in [the Self-check answers](../self-check-answers.md#h08).

Next: [H09 — Node-Wide Injection (NRI) demo](../09-node-wide-injection/README.md)
