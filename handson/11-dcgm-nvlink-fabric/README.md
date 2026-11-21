# H11 — DCGM, NVLink/NVSwitch fabric, and NUMA topology

**Why:** H00-H04 focused on NVML/`nvidia-smi`.
This module covers the other three signal sources that GPU platform teams alert on:
DCGM (what `dcgm-exporter` and monitoring dashboards read),
the NVLink/NVSwitch fabric (what ComputeDomain and NVSentinel react to),
and NUMA/PCI locality (what scheduling and placement decisions use).
Every command below was run against a live Mokka install before being written down.
See the note on `dcgmi`/`dcgm-exporter` below for why that mattered.

**Concepts:** [CONCEPTS.md §1](../CONCEPTS.md#1-contract-surface-simulation-not-hardware-simulation) (reads vs. executes —
this module is entirely reads) and the new [§8](../CONCEPTS.md#8-out-of-scope-cuda-nccl-and-the-real-rdmanvlink-data-path) (what none of this proves).

## Prerequisites

You need H00's cluster and `nvml-mock` release, with the class `b300` profile.
It declares two NVSwitch chips, so the mock reports `NV18` between all 8 GPUs and a fabric-manager state,
as a real HGX B300 node does.
The expected output below comes from that profile.
`a100` (NVLink 3, 12 links), `h100` (NVLink 4, 18 links),
and `b200` and `gb200` (NVLink 5, 18 links, as `gb300`) also declare NVLink.
`t4` and `l40s` do not.

## Part A — NVLink, NUMA, and PCI topology (via `nvidia-smi`, no extra install)

```bash
POD=$(kubectl -n mokka get pod -l app.kubernetes.io/name=nvml-mock -o jsonpath='{.items[0].metadata.name}')
kubectl -n mokka exec "$POD" -- nvidia-smi topo -m
```

```
        GPU0    GPU1    GPU2    GPU3    GPU4    GPU5    GPU6    GPU7    CPU Affinity    NUMA Affinity   GPU NUMA ID
GPU0     X      NV18    NV18    NV18    NV18    NV18    NV18    NV18    0-63            0               0
GPU1    NV18     X      NV18    NV18    NV18    NV18    NV18    NV18    0-63            0               0
GPU2    NV18    NV18     X      NV18    NV18    NV18    NV18    NV18    0-63            0               0
GPU3    NV18    NV18    NV18     X      NV18    NV18    NV18    NV18    0-63            0               0
GPU4    NV18    NV18    NV18    NV18     X      NV18    NV18    NV18    64-127          1               1
GPU5    NV18    NV18    NV18    NV18    NV18     X      NV18    NV18    64-127          1               1
GPU6    NV18    NV18    NV18    NV18    NV18    NV18     X      NV18    64-127          1               1
GPU7    NV18    NV18    NV18    NV18    NV18    NV18    NV18     X      64-127          1               1
```

`NV18` means "connected by a bonded set of 18 NVLinks" (the profile's `links_per_gpu`).
GPU0-GPU3 share NUMA node 0, and GPU4-GPU7 share NUMA node 1, matching a 2-socket HGX B300 node.
This comes straight from the declared profile, not from anything measured.

Cross-check the same NUMA assignment at the raw sysfs level (the `pcibus` simulator's staged tree,
delivered the same `LD_PRELOAD` way as in [H04](../04-node-daemon-and-shims/README.md)):

```bash
kubectl -n mokka exec "$POD" -- sh -c 'for f in /sys/bus/pci/devices/*/numa_node; do echo "$f: $(cat $f)"; done'
```

## Part B — NVLink/NVSwitch fabric health (via `nvml-mock-ctl`, no extra install)

The `Fabric` block in `nvidia-smi -q` reports NVSwitch registration state and health.
The `fabricmanager` simulator generates it, standing in for `nv-fabricmanager`:

```bash
kubectl -n mokka exec "$POD" -- nvidia-smi -q -i 0 | grep -A10 "^    Fabric"
```

Degrade it at runtime, the same way you injected temperature and ECC in [H02](../02-runtime-control/README.md):

```bash
kubectl -n mokka exec "$POD" -- nvml-mock-ctl fabric-health --gpu 0 route_unhealthy
sleep 2
kubectl -n mokka exec "$POD" -- nvidia-smi -q -i 0 | grep -A10 "^    Fabric"
# Health / Summary flips to Unhealthy, Route Unhealthy: True

kubectl -n mokka exec "$POD" -- nvml-mock-ctl fabric-health --gpu 0 healthy   # heal
```

`nvml-mock-ctl fabric-health --help` lists the other conditions:
`degraded_bandwidth`, `route_recovery`, `access_timeout_recovery`,
and misconfiguration states (`no_partition`, `insufficient_nvlinks`,
`incompatible_gpu_fw`, `invalid_location`, `incorrect_sysguid`,
`incorrect_chassis_sn`, `gpu_state_invalid`).
Use these to practice deciding which of these conditions a real NVSwitch or Fabric Manager problem would raise,
without a real NVSwitch to break.

## Part C — NVLink error counters (recap + the DCGM field ids)

You already did this in [H02 §6](../02-runtime-control/README.md#6-nvlink-and-sram-ecc-error-injection):

```bash
kubectl -n mokka exec "$POD" -- nvml-mock-ctl nvlink-error --gpu 0 500
sleep 2
kubectl -n mokka exec "$POD" -- nvidia-smi nvlink -e -i 0 | head -20   # per-link error counters climbing
kubectl -n mokka exec "$POD" -- nvml-mock-ctl nvlink-error --gpu 0 0   # heal
```

This is what DCGM's `NVML_FI_DEV_NVLINK_ERROR_DL_{REPLAY,RECOVERY,CRC}` fields (ids 161-163) and `DCGM_HEALTH_WATCH_NVLINK` read.
See Part D to watch it through `dcgmi` instead of `nvidia-smi`.

## Part D — DCGM itself, standalone (no GPU Operator needed)

**A caution before you run this:** the upstream FAQ and docs describe DCGM as a "tested consumer," but they do not show a standalone install path.
Every official example installs it through the full GPU Operator (H07).
The manifest and commands below were **verified by running them** against this training's `mokka` cluster.
That is why they are this specific.

### Start a real `nv-hostengine` + `dcgm-exporter` pod, pointed at Mokka's driver root

```bash
kubectl apply -f manifests/dcgm-exporter-pod.yaml
kubectl -n mokka wait --for=condition=ready pod/dcgm-test --timeout=300s   # first pull is slow, image is >1 GB
```

This needs no CDI, no toolkit, and no operator;
it only points `LD_LIBRARY_PATH` at the staged driver tree,
the same trick that H05's device plugin manifest uses with `--nvidia-driver-root`.

### `dcgmi discovery` — DCGM enumerating the mock GPUs

```bash
kubectl -n mokka exec dcgm-test -- sh -c '
  export LD_LIBRARY_PATH=/var/lib/nvml-mock/driver/usr/lib64
  nohup nv-hostengine -n --log-level ERROR >/tmp/nvhe.log 2>&1 </dev/null &
  sleep 2
  dcgmi discovery -l
'
```

Expect all 8 GPUs listed with their PCI bus IDs and UUIDs.
DCGM found them entirely through the mock NVML library; nothing here is DCGM-specific mocking.

### `dcgmi dmon` — live fields, correlated with an injected fault

```bash
# baseline
kubectl -n mokka exec dcgm-test -- sh -c 'export LD_LIBRARY_PATH=/var/lib/nvml-mock/driver/usr/lib64; dcgmi dmon -e 150,155 -c 1'
# field 150 = DCGM_FI_DEV_GPU_TEMP, 155 = DCGM_FI_DEV_POWER_USAGE

# now pin GPU 0 hot via nvml-mock-ctl and re-read through DCGM, not nvidia-smi
kubectl -n mokka exec "$POD" -- nvml-mock-ctl temp --gpu 0 95
sleep 2
kubectl -n mokka exec dcgm-test -- sh -c 'export LD_LIBRARY_PATH=/var/lib/nvml-mock/driver/usr/lib64; dcgmi dmon -e 150,155 -c 1'
# GPU 0's TMPTR column jumps to 95 — same override, read through a completely different real binary

kubectl -n mokka exec "$POD" -- nvml-mock-ctl reset
```

This is the concrete version of the "one override,
every consumer converges" idea from [CONCEPTS.md §4](../CONCEPTS.md#4-the-mock-nvml-library-runs-inside-each-consumer--there-is-no-daemon):
`nvidia-smi` and `dcgmi` are two unrelated processes, and both saw the same change within one TTL.

### The real `dcgm-exporter` `/metrics` endpoint

```bash
kubectl -n mokka exec dcgm-test -- sh -c '
  export LD_LIBRARY_PATH=/var/lib/nvml-mock/driver/usr/lib64
  nohup dcgm-exporter --address :9400 >/tmp/exporter.log 2>&1 </dev/null &
  sleep 4
'
kubectl -n mokka port-forward pod/dcgm-test 9400:9400 &
sleep 2
curl -s localhost:9400/metrics | grep -E 'DCGM_FI_DEV_GPU_TEMP|DCGM_FI_DEV_GPU_UTIL|DCGM_FI_DEV_POWER_USAGE'
kill %1   # stop the port-forward
```

This is the real Prometheus exposition format that `dcgm-exporter` ships in production.
A Grafana dashboard built against this output does not know or care that it is pointed at Mokka.

## Clean up

```bash
kubectl -n mokka delete pod dcgm-test --ignore-not-found
```

## What this does not prove

See [CONCEPTS.md §8](../CONCEPTS.md#8-out-of-scope-cuda-nccl-and-the-real-rdmanvlink-data-path):
no NVSwitch ASIC, no real NVLink traffic, no CUDA peer access, no NCCL collectives.
`DCGM_FI_PROF_*` activity metrics are a fixed fraction of `utilization.gpu`, not measured GPU work.
Do not build an "is this GPU busy" alert against them here and expect it to mean the same thing on real hardware.
For the full multi-node fabric-identity story (cluster/clique UUIDs,
a real `nvidia-imex` peer protocol),
see [H10a — Compute Domain](../10-advanced-guides/compute-domain.md).
For the complete detect→cordon→drain→recover loop built on the thermal fields you read DCGM,
see [H10b — NVSentinel](../10-advanced-guides/nvsentinel.md).

## Self-check

- You changed a GPU's temperature with `nvml-mock-ctl`,
  and read the new value through `dcgmi dmon`, not `nvidia-smi`.
  Why did that work with no DCGM-specific configuration?
- `nvidia-smi topo -m` shows `NV18` between every GPU pair.
  Does that mean this cluster tested NVLink bandwidth?

Check your answers in [the Self-check answers](../self-check-answers.md#h11).

Next: [H12 — InfiniBand fabric tooling](../12-infiniband-fabric/README.md)
