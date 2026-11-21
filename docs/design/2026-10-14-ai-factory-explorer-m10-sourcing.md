# AI Factory Explorer, milestone 10: sourcing note

**Use:** the sources of the facts of Collectives mode (`src/catalog/collectives.ts`).
**Design:** [the Collectives mode design](2026-10-14-collectives-mode-design.md).

## Confirmed

| Fact | Value | Source |
|------|-------|--------|
| The bus factor of AllReduce | `2(n-1)/n` | [nccl-tests PERFORMANCE.md](https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md) |
| The bus factor of AllGather and ReduceScatter | `(n-1)/n` | the same page |
| The meaning of busbw | algbw × the bus factor, to compare with the speed of the slowest link | the same page |
| The ring AllReduce | n-1 reduce-scatter steps, then n-1 all-gather steps | [Demystifying NCCL](https://arxiv.org/abs/2507.04786) |

## The direction of each bandwidth

- NVLink: `nvlinkPerGpu` (1.8 TB/s for B300, 0.9 TB/s for H100) counts the two directions.
  The tracer divides it by 2 and gives Gb/s in each direction (`src/routing/trace.ts`, `nvlinkBw`).
- The compute NIC and the leaf link: a link speed (800 Gb/s XDR, 400 Gb/s NDR, 400 Gb/s for each Spectrum-X plane) is for one direction.
- The busbw panel divides Gb/s by 8 to give GB/s, as nccl-tests reports it (1 GB is 10^9 bytes).

## Assumed

| Fact | Why |
|------|-----|
| The ring order on 2 nodes | NCCL builds its rings from the topology that it finds; no page gives the order for these servers |
| Channel 0 only | NCCL runs a number of rings at the same time; `NCCL_DEBUG=INFO` shows them |
| No latency model | At small sizes, the latency controls the time |
| The limit of a dual-plane fabric is for one plane | NCCL can use the two planes |
| On 1 node, the ring order does not change the limit | Each GPU reaches each other GPU through the NVSwitch chips at the full NVLink bandwidth |
| On 2 nodes, 8 channels, one through each NIC: the limit is 8 × the NIC speed, unless NVLink is lower | The paper: "each channel can independently exit the node through a different NIC"; the count (one ring for each compute NIC) is the model of the app |

## Not modelled

- No efficiency factor (the part of the limit that a real run gets): no source gives one for these platforms.
- A degraded link keeps its sourced bandwidth: no source gives the bandwidth of a link with a high BER.
