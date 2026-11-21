# H10 — Advanced guides

These are the three heaviest Mokka guides.
Each guide has two tracks:

- **Option A** — run it live.
  The tooling and resource requirements are spelled out up front,
  so you can judge whether your machine and time budget can take it.
- **Option B** — a guided conceptual walkthrough (no cluster) that still ends in a self-check.
  Use this when Option A does not fit right now.

| Guide | What it proves | Heaviest part |
|---|---|---|
| [Compute Domain](compute-domain.md) | NVLink fabric identity + a **real** `nvidia-imex` peer protocol over mock GPUs | 4-worker cluster, 2 local image builds |
| [NVSentinel](nvsentinel.md) | Full detect → cordon/drain → auto-recover loop on a thermal fault | GPU Operator + cert-manager + MongoDB stack, ~30 min |
| [Run:ai FGO](runai-fgo.md) | Two GPU simulators coexisting on disjoint node pools of one cluster | Lightest of the three — no operator stack |

Choose independently for each guide.
Running Option A for one guide and Option B for another is normal.

Next: [H11 — DCGM, NVLink/NVSwitch fabric, and NUMA topology](../11-dcgm-nvlink-fabric/README.md)
