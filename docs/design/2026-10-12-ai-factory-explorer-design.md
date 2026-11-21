# AI Factory Explorer: design

**Status:** design record, 2026-10-12. It describes the first three modes and the data model.

## 1. Goal

An interactive single-page application that shows all the connected parts of an AI factory,
from the internet edge to one GPU.
An SRE or platform engineer can:

- see each network of the cluster, and each ingress and egress path;
- see why a rail-optimized fabric keeps GPU traffic one hop away;
- go down from the factory to one scalable unit (SU), one rack, one HGX or DGX server, and one component;
- change the GPU platform, the fabric, and the other design choices, and see the result at once;
- trace a path between two parts, hop by hop;
- fail a part and see the blast radius, the alerts, the severity, and the first action.

The application must answer most of the topology questions that an on-call engineer has.
It uses the knowledge of this repository: the hardware matrix, the runbooks, and the triage guide.

### 1.1 Audience and hosting

- **Audience:** SRE and platform engineers who operate a GPU cluster, and their trainers.
They know Linux and Kubernetes; they do not know GPUs, RDMA, or the fabric yet.
- **Hosting:** the build is one self-contained HTML file.
CI attaches it to each `v*` release, and publishes a container image.
A static host can serve the same file; it is not part of the build.

### 1.2 What the user asked, and what we assumed

The user asked for:
all components and their connections; all ingress and egress paths; the rail-optimized design;
the factory level and the HGX/DGX box level;
switches for the GPU type and the network design;
a single-page application that is quick to start and to host;
the use of the existing knowledge in the repository.

We assumed, and the user confirmed:
the audience is the operators of the cluster;
v1 has three modes: explore and inspect, path tracer, failure simulator;
guided tours wait for v2;
each value shows its source, with the same rule as `handbook/hardware-matrix.md`.

### 1.3 Constraints

- **No client identifiers.** No client name, no location, no total GPU count.
No preset has the site's scale:
the scale values (SU count, last SU fill, spares) together give the GPU count.
The user types the scale values (SU count, last SU fill, spares, CBoxes and DBoxes); the defaults are generic.
The "Site parts" preset sets the part types only.
- **Sourced values only.** Each number is a Fact with a status and a source (section 4.1).
- **Markdown in STE with semantic line breaks** (the repository style).

## 2. Scope

### 2.1 In v1

- **Platforms:**
  - HGX B300 (the training default) and HGX B200;
  - HGX H100 and H200, for contrast;
  - GB200 NVL72 and GB300 NVL72, at rack level;
  - AMD MI355X as a catalog entry with its gaps, in a compare table only, with no topology.
- **Compute fabrics:** InfiniBand XDR (Quantum-X800 Q3400), InfiniBand NDR (Quantum-2 QM9700), Spectrum-X Ethernet (SN5610).
- **Other networks:** the converged/frontend Ethernet, storage, in-band management, out-of-band (OOB), NVLink, PCIe inside the node, the north-south edge, and power and cooling.
- **Modes:** explore and inspect; path tracer; failure simulator.

### 2.2 Not in v1

- Guided tours (v2).
- Compare two configurations side by side.
- AMD topology.
- A 3D view.
- Hosting on a server.
- Governance, staffing, KPI reports, the ITSM process, the text of the security policy, and how to write an HLD: these are not topology, and they stay in the Markdown files.

## 3. Sourced topology facts (the base of the design)

| Fact | Source |
|------|--------|
| SU = 72 DGX B300 = 576 GPUs; 4 systems for each rack (about 56 kW for each rack) | [DGX SuperPOD B300 XDR architecture](https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-b300-xdr/latest/dgx-superpod-architecture.html) |
| Switch and cable table: 1 SU = 8 leaf, 4 spine, 576 + 576 cables; 2 SU = 16, 8, 1152 + 1152; 4 SU = 32, **18**, 2304 + 2304; 8 SU = 64, 36, 4608 + 4608; 18 SU = 144, 72, 10368 + 10368 | same page, Table 3 |
| "Traffic per rail of the DGX B300 systems is always one hop away from the other 72 nodes in a SU." "Traffic between SUs, or between rails, traverses the spine layer." | [DGX SuperPOD B300 XDR network fabrics](https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-b300-xdr/latest/network-fabrics.html) |
| UFM nodes connect to the Q3400 switches; storage fabric is IB (MQM9700) or Ethernet (SN5610), about 4:3 oversubscribed for the DGX; in-band on SN5610; OOB on SN2201; EVPN-VXLAN segmentation; customer edge: at least 2 × 100GbE, BGP | same page |
| Dual plane: each GPU's 800 Gb/s is 2 × 400 Gb/s to two independent fabrics; single plane: 1 × 400 Gb/s. Three physical networks: compute, CPU converged (2 × 400 GbE for each node, BlueField-3), OOB | [HGX AI Factory networking physical topologies](https://docs.nvidia.com/enterprise-reference-architectures/hgx-ai-factory/latest/networking-physical-topologies.html) |
| PXN: a GPU sends data over NVLink to the GPU on the correct rail, so the traffic stays rail-local | [NCCL 2.12 PXN blog](https://developer.nvidia.com/blog/doubling-all2all-performance-with-nvidia-collective-communication-library-2-12/), [NCCL 2.12.7 release notes](https://docs.nvidia.com/deeplearning/nccl/release-notes/rel_2-12-7.html) |
| B300: 8 GPUs, 288 GB each, NVLink 5 at 1.8 TB/s for each GPU, NV18 in `topo -m`; 8 ConnectX-8 at up to 800 Gb/s, one for each GPU; 2 NUMA nodes of 4 GPUs | `handbook/hardware-matrix.md`, `handson/profiles/b300.yaml` |
| NVL72: 72 GPUs and 36 Grace CPUs in one NVLink domain; failure domain up to 72 GPUs; FM, NVLSM, and IMEX | `handbook/hardware-matrix.md` |
| Failure signals and checks for each component (Xids, counters, commands, runbooks) | `handbook/b300-nvl72-forum-triage-guide.md`, `handbook/command-reference.md`, `handbook/runbook-catalog.md` |
| The site's design (structure only): Dell HGX B300 on the NCP RA; IB Q3400 leaf-spine with 2 UFM; SN5610 frontend with storage and control-plane leaf pairs; SN4700 control plane with ConnectX-6 at 100G; VAST; Rafay; firewall and edge routers | the site requirements, section 0 |

The RA rows are data, not a formula: 4 SU has 18 spines, not 16.

**Gaps to source before the catalog code (section 9.1):**
the NCP RA SU size; the H100 SuperPOD NDR SU size and switch counts; the Spectrum-X RA SU (64 systems);
the GB200 and GB300 NVL72 tray counts; the HGX H100 NVSwitch count; the NIC and PCIe-switch layout of H100 against B300.

## 4. Configuration and data model

### 4.1 The Fact

Each number in the catalog is a Fact:

```ts
type Fact<T> = {
  value: T
  unit?: string
  status: 'confirmed' | 'derived' | 'assumed' | 'ask-supplier' | 'not-sourced'
  source?: string          // a repo "file:line" or a vendor URL
  formula?: string         // only when status = 'derived'
}
```

The UI shows a different mark for each status.
A value that comes from an open decision of the site requirements also shows a "decision open" badge.

### 4.2 The Config

One `Config` object holds all the switches.
It is encoded in the URL, so each view can be shared as a link.
The left sidebar has seven collapsible panels.
A collapsed panel shows a one-line summary (for example, "IB XDR · rail-opt · dual plane · 4 SU").

| Panel | Switch | Values |
|-------|--------|--------|
| 1 Preset | Preset | DGX SuperPOD B300 XDR · NCP RA HGX B300 · HGX AI Factory Enterprise RA (4-node SU) · H100 SuperPOD NDR · GB200 NVL72 SuperPOD · Site parts (no counts). A preset sets the other switches; then the user changes any one of them. |
| 2 Compute | Platform | HGX H100 · H200 · B200 · B300 · GB200 NVL72 · GB300 NVL72 |
| | System build | DGX · OEM HGX (Dell XE9780 air, XE9780L liquid). Changes the BlueField-3 count, the BMC name, and the trays. |
| | Servers per rack | from the catalog of the build (for example, 4 for DGX B300) |
| | Cooling | Air · Liquid (adds CDUs and the coolant loop). Open decision 12, so both stay selectable. |
| 3 Compute fabric | Fabric type | IB XDR (Q3400) · IB NDR (QM9700) · Spectrum-X Ethernet (SN5610). Sets the SU size from the catalog. |
| | Topology | Rail-optimized · Top-of-rack (for contrast) |
| | Planes | Single · Dual (dual only where the NIC supports it, for example ConnectX-8) |
| | NCCL PXN | On · Off |
| | Scale | SU count from the RA table of the fabric (1, 2, 4, 8, 18 for XDR) |
| | Last SU fill | Servers in the last SU. RA rule: build all the switches and cables of the SU; leave the empty positions empty. |
| | Spare pool | Count of cold spares outside the fabric (node state "spare") |
| | UFM | Single · HA pair (active/standby) |
| 4 Ethernet and management | Frontend fabric | Spine and leaf counts (SN5610) |
| | Storage leaf pair | On · Off |
| | Control-plane network | Leaf pair; SN4700 with ConnectX-6 at 100G |
| | OOB | SN2201 switches |
| | Network automation | None · Netris (controller, one agent on each switch, UFM plugin). "Decision open". |
| 5 Storage | VAST | CBox and DBox counts; VIP pools; GPUDirect Storage on or off |
| | Storage fabric | Ethernet RoCE (converged) · dedicated IB storage fabric |
| | Other storage | Ceph (3) · Linstor (3), each "role not decided" |
| 6 Platform and edge | Cluster manager | Rafay only · BCM · Mission Control |
| | Orchestration | Kubernetes through Rafay · Slurm · Both |
| | Rafay controller | Self-hosted HA (3 masters and 1 worker; Velero backup to S3 or MinIO) · SaaS |
| | Workload form | Bare metal · Kubernetes · VMs (KubeVirt, "branch") |
| | Control-plane LB | Firewall at L4 · HAProxy or Nginx on the control nodes. Each shows the two L4 paths (TLS offload, TLS passthrough). |
| | Edge | Router count, firewall, uplink speed |
| | ITSM integration | On · Off ("off" shows a manual ticket by L1) |
| 7 Overlays (more than one at a time) | Network layers | compute · storage · in-band · OOB · NVLink · PCIe · power · cooling |
| | Tenancy | GPU tenants, non-GPU tenants, UAT tenant (generic counts); isolation by IB PKeys, VLAN/VRF (EVPN-VXLAN), VAST VIP pools and views |
| | Telemetry | each source → collector → Prometheus → Alertmanager → ITSM; NMX for NVL72 only |
| | Ownership | partner · facility team · enterprise network · Rafay · VAST · OEM · customer workload |
| | Node state | available · allocated · degraded · quarantined · maintenance · spare |
| | Phase | phase 1 · phase 2 for each SU |

**Valid combinations.** A value that is not valid with the other values shows as disabled, with the reason as a tooltip
(for example, NVL72 with air cooling, or dual plane with a NIC that does not support it).
The application never makes a configuration that is not valid.

### 4.3 The three layers

1. **Catalog** (`src/catalog/`): platforms, switches, NICs, cables, services, RA tables, failure rules, and links to the docs.
Each component kind maps to its module, runbooks, failure signals, check commands, tools ("Seen in"), and operator level ("Operated by").
2. **Generator** (`src/topology/`): pure functions, `generate(config) → Graph`.
   - A graph node has an `id`, a `kind`, a `parent` (tray → server → rack → SU → pod), and a catalog reference.
   The kinds include gpu, nvswitch, nic, dpu, cpu, dimm, pcie-switch, nvme, bmc, psu, fan, server, compute-tray, nvlink-switch-tray, leaf, spine, ufm, storage-cnode, storage-dnode, firewall, router, lb, rafay-controller, k8s-control, slurm-head, dns, ntp, ipam, pam-bastion, cdu, pdu, ups, and the node services (driver, fabric-manager, nvlsm, imex, container-toolkit, device-plugin, dcgm-exporter).
   - A graph edge has a `kind` (`physical` or `dependency`), a `network`, a `bandwidth` Fact, and a `rail`, a `plane`, and a `count` where these apply.
   - The graph keeps each cable. Bundles are a view-level aggregation only.
3. **Views** (`src/views/`): they read the graph and do not change it.
The tracer and the simulator are functions on the graph.

## 5. Views and screen layout

### 5.1 The screen

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│ AI Factory Explorer   [Explore | Trace | Simulate]   search        Pod › SU2 › n05 │
├──────────────┬────────────────────────────────────────────────┬───────────────┤
│ CONFIG       │                                                │ INSPECTOR     │
│ ▸ Preset     │                                                │ [Specs]       │
│ ▾ Compute    │            main canvas (Cytoscape)             │ [Signals]     │
│ ▸ Fabric     │                                                │ [Learn]       │
│ ▸ Ethernet   │                                       ┌──────┐ │ [Owner/Tool]  │
│ ▸ Storage    │                                       │ mini │ │               │
│ ▸ Platform   │                                       │ map  │ │               │
│ ▸ Overlays   │                                       └──────┘ │               │
├──────────────┴────────────────────────────────────────────────┴───────────────┤
│ Legend │ Numbers: GPUs · leaf · spine · cables · transceivers · bisection · ✓ RA │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **Numbers bar:** the GPU, switch, cable, and transceiver counts and the bisection bandwidth of the current configuration;
"✓ RA" when the counts equal the RA table.
- Desktop first, minimum width 1280 px. Light and dark themes.
- Keyboard: `/` search; `Esc` up one level; `1` to `8` highlight a rail.
- The rail palette is safe for colour blindness, and each port shows its rail number.

### 5.2 The zoom levels

Double-click goes down one level; `Esc` or the breadcrumb goes up.

1. **Factory overview:** all networks as blocks (fewer than 100 elements).
Internet/ISP → edge routers → firewall → LB → frontend spine → leaves → control plane (Rafay, K8s or Slurm heads, UFM, BCM), storage (VAST, Ceph, Linstor), compute pods (SUs), OOB, facility (power chain, CDUs), and the external dependencies (DNS, NTP, IPAM).
2. **Compute fabric:** spines at the top; leaves coloured by rail; SU containers with the servers, each server one box with 8 coloured ports.
   - Dual plane: plane A and plane B side by side.
   - Rail-optimized: leaf k in each SU takes port k of all servers; key `k` lights up rail k.
   - Top-of-rack: each rack has its own leaves, and the rail colours mix.
   - SUs are collapsed until opened. Leaf-to-spine cables are bundled for each switch pair, with a count.
3. **Rack elevation and port map:** the racks of one SU, front and rear, with U positions, servers, switches, PDUs, and (liquid) the CDU and the manifold.
A click on a port shows the cable, its type (DAC or transceiver part family), and the far end with its switch and port.
This is the physical picture for onsite work and for the port-map check of M3 lab step 5.
4. **Node view:** one HGX or DGX box.
   - The parts: 8 GPUs, the NVSwitch chips, the NICs (ConnectX-8 with its own PCIe switch, or ConnectX-7 with separate PCIe switches), 2 CPUs with NUMA domains and DIMMs, NVMe, BlueField-3 (DGX), the BMC/iDRAC, the PSUs, the fans, and the node services layer.
   - The node's ports to the four networks are on its edge.
   - A `nvidia-smi topo -m` overlay (NV18, PIX, NODE, SYS) shows the GPU–NIC affinity.
   - NVL72: a rack-scale node view with compute trays, NVLink switch trays, power shelves, and the IMEX domain.
5. **Component:** the inspector only.

### 5.3 Element budget

At 8 SU, the compute fabric has 576 servers, 100 switches, and about 9 200 cables.
With servers as one box, SUs collapsed, and leaf-to-spine bundles, a normal screen has fewer than 1 500 elements.
The worst case, all SUs open, is about 10 000 elements.

### 5.4 Inspector

| Tab | Content |
|-----|---------|
| Specs | each Fact with its status mark and its source link |
| Signals | failure signals (Xids, counters, log lines), check commands, and blast radius, from the triage guide, the command reference, and the runbook catalog |
| Learn | module, runbooks, hands-on lab: links to the repository files on GitHub, pinned to the release tag |
| Owner/Tool | owner (ownership overlay); "Seen in" (UFM, NetQ, iDRAC, DCGM, VMS, Rafay); "Operated by" (L1 read-only, L2, L3) from the site requirements |

### 5.5 Search and selection

Search finds a part by name or kind ("rail 3", "UFM", "su2 n05").
Hover shows a label. Click selects the part, shows it in the inspector, and highlights its direct links.
Shift-click adds to the selection.

## 6. Path tracer

The user clicks a source and a destination, or selects a scenario.
The canvas animates the packets hop by hop; a hop table opens at the bottom; `Next` and `Back` step through the hops.

Routing is a set of rules for each fabric type, not a generic shortest path:

| Scenario | Path |
|----------|------|
| GPU → GPU, same node | GPU → NVLink → NVSwitch → GPU; no NIC |
| Same rail, same SU | GPU → PCIe → NIC k → leaf k → NIC k → GPU: one hop |
| Different rail, PXN off | NIC a → leaf a → spine → leaf b → NIC b |
| Different rail, PXN on | GPU → NVLink → the GPU on the correct rail → NIC b → leaf b → NIC b; no spine |
| Different SU | leaf k (SU1) → spine → leaf k (SU2); all equal-cost spines show as a fan (ECMP, adaptive routing) |
| Dual plane | 2 × 400G, one on plane A and one on plane B |
| NVL72 | same rack: NVLink switch trays (MNNVL, IMEX); other rack: the IB fabric |
| GPU → VAST | GDS on: GPU → NIC (converged, BlueField-3) → storage leaf → VAST CNode → DNode; GDS off: through a bounce buffer in CPU memory |
| User → service | internet → edge router → firewall → LB VIP → Rafay controller or K8s ingress → pod |
| Operator access | operator → PAM/bastion → OOB switch → BMC; operator → Rafay ZTKA → kubectl; break-glass |
| Telemetry | dcgm-exporter, UFM, iDRAC Redfish, NetQ → Prometheus → Alertmanager → ITSM or a manual ticket |
| Control | UFM → SM MADs → switches; Fabric Manager and NVLSM → NVSwitch |

For each hop, the table shows the link type, the bandwidth Fact, the network, the plane, the rail, and the counter or command to check on that hop
(for example, `perfquery -x` on that port, `mlxlink`, or `ethtool -S` for RoCE).
The hop with the lowest bandwidth is the **bottleneck**.

With failures from the simulator, the tracer routes around a failed part (another spine; the other plane at half bandwidth),
or it shows "no path" and the reason.

## 7. Failure simulator

The user selects a part and presses **Fail**, or selects a scenario.
More than one failure at a time is permitted. `Reset` clears all failures.
The failures are in the URL.

### 7.1 Failure kinds

- GPU: Xid 79 (off the bus), Xid 48 (DBE).
- NVSwitch.
- Node services: Fabric Manager, NVLSM, IMEX (NVL72), device plugin, driver.
- NIC or SuperNIC.
- Cable: **down**, or **degraded (high BER)**: the link stays up and slows each job that crosses it.
- Switches: leaf, spine, storage leaf.
- UFM: the active unit (the standby takes over), or both units.
- Node parts: PSU (one of N), BMC.
- Facility: CDU, PDU.
- Storage: VAST CNode.
- Platform and edge: Rafay controller, LB, firewall, DNS, NTP (clock skew).

### 7.2 Propagation

1. **Physical rules:** remove the part; recompute reachability (BFS) and bandwidth.
A leaf down in single plane: rail k is lost for the servers of that leaf; in dual plane: those servers run at half bandwidth.
A spine down: the cross-section bandwidth falls, with no partition.
2. **Dependency rules:** walk the dependency edges.
Fabric Manager down → 8 GPUs lose NVLink. IMEX down → up to 72 GPUs.
Both UFM units down → no SM; the canvas shows what continues to work and what does not.
CDU down → throttling, then a shutdown of the rack.
Rafay controller down → the jobs continue; the control actions fail.

All rules are in `src/catalog/failures.ts`, each with a repository source; a rule without a source has the status "assumed".

### 7.3 Impact panel

| Field | Content |
|-------|---------|
| Affected | GPUs (count and %), nodes, racks, SUs, tenants, services |
| Capacity | GPU availability %; the largest usable pool after the drain; lost GPU hours (the user gives the hours) |
| Severity | P1 to P4 from the affected capacity (the site requirements). The P1 and P2 thresholds are inputs, "assumed" until the site gives them. |
| Alerts | each alert that fires, then grouped into incidents ("14 alerts → 1 incident"): topology-aware correlation |
| First action | first command, runbook ID, who acts (L1, L2, L3, onsite, facility, OEM), and what to drain (a node or an NVL72 rack) |

### 7.4 Scenario library (v1)

- FM stops on one server: what do you drain? (M1)
- One link in 10 000 has a high symbol error rate. (M3)
- The UFM master failed over at night. (M3)
- A leaf goes down: single plane against dual plane.
- A spine goes down.
- The Rafay console is down, but the jobs run. (M9)
- A pod is Running but has no GPU. (M9)
- A 512-GPU all-reduce gives 40 % of the expected bus bandwidth.
- A cluster that is partly degraded.

## 8. Coverage

The explorer covers the topology questions of an AI factory: the compute fabric, the other
networks, the edge, storage, the platform, the facility, the tenant view, and the paths between
them. Governance, staffing, KPI reports, the ITSM process, the text of the security policy, and
how to write an HLD are not topology; they stay in the operator documents.

## 9. Build, delivery, and tests

### 9.1 Sourcing pass (before the catalog code)

Fetch and record the gaps of section 3.
A value that no page gives stays "not sourced" in the UI.
The new sources go into the catalog, each with its public URL.

### 9.2 Stack

Vite, React, and TypeScript (strict); Cytoscape.js for the canvas; Zustand for the state;
plain CSS with tokens for the light and dark themes (native form controls, no UI kit);
Vitest; Playwright (Chromium); `vite-plugin-singlefile`; Node 24.
Exact versions are pinned in `package.json` and in the lockfile.

**Why Cytoscape.js:** it has preset layouts, group containers, selector-based styles, and built-in BFS and shortest-path,
and it handles a few thousand elements on canvas.
React Flow is slow above about 1 000 edges and has no graph algorithms.
A no-build D3 page has no tests and fails offline.

### 9.3 Layout

```text
ai-factory-explorer/
  README.md                 how to run, build, and add a platform
  package.json  vite.config.ts  tsconfig.json  index.html
  src/
    catalog/                platforms, switches, nics, cables, services, failures, docs-links, ra-tables
    config/                 Config type, valid-combination rules, presets, URL encode/decode
    topology/               generate(config) → Graph: fabric, node, nvl72, ethernet, storage, edge, facility
    routing/                path rules for each fabric; trace(graph, src, dst, failures)
    simulate/               propagate, impact, severity, alert grouping
    views/                  Graph → Cytoscape elements and positions for each zoom level
    ui/                     ConfigPanel, Canvas, Inspector, NumbersBar, HopTable, ImpactPanel, Search
  tests/                    Vitest unit tests
  e2e/                      Playwright smoke test on the built file
```

### 9.4 Delivery

- **Local:** `npm ci && npm run dev`.
`npm run build` makes `dist/index.html`; it opens from `file://` with no server and no network.
- **CI:** `.github/workflows/ci.yml`, with actions pinned by SHA.
  - A pull request: install, type-check, unit tests, build, smoke test.
  - A `v*` tag: attach `ai-factory-explorer-<tag>.html` to the release (`gh release create || gh release upload --clobber`).
- **Image:** `.github/workflows/image.yml` publishes `ghcr.io/<owner>/ai-factory-explorer` on each push to `main`.

### 9.5 Tests

| Test | What it proves |
|------|----------------|
| Each Fact has a status; each repository `file:line` source exists | The data keeps its sources |
| XDR, SU = 1, 2, 4, 8, 18: leaf, spine, node-leaf cables, leaf-spine cables equal the RA table | The fabric numbers are correct |
| Rail-optimized: port k of each server goes to the rail-k leaf of its SU | The main design rule |
| Combinations that are not valid are refused | Bad configurations do not get to the canvas |
| Each row of the tracer table in section 6 | The routing lessons |
| FM → 8 GPUs; IMEX → 72; leaf down, single against dual plane; UFM failover; 14 alerts → 1 incident | The blast-radius lessons |
| Smoke test on the built file: renders; platform switch; open a node; one trace; one failure; no console errors; 8 SU fully open renders in less than 3 s on the CI runner | The delivered file works |

**No site identifiers:** the app holds no site name, no location, and no total GPU count.
The scale values have generic defaults, and the "Site parts" preset sets the part types only.

## 10. Milestones

One pull request for each milestone:

1. **Foundation:** sourcing pass for B300 and XDR; scaffold; single-file build; CI; compute-fabric view; node view; inspector; Numbers bar.
2. **The whole factory:** sourcing pass for the other platforms and fabrics; overview; Ethernet, storage, edge, facility; rack elevation and port map; H100, B200, NVL72; overlays.
3. **Path tracer.**
4. **Failure simulator** and the scenario library.
5. **Finish:** search, sharing by URL, the release attachment, the README and module links.

## 11. Risks

| Risk | Mitigation |
|------|------------|
| The RA pages do not give a value that the picture needs (rail cabling for NDR, NVL72 trays) | The value shows "not sourced"; the view still renders with a generic layout |
| 8 SU fully open is slow | Collapsed SUs and bundles by default; the smoke test fails if 8 SU fully open takes 3 s or more |
| The site preset leaks the scale | The preset has parts only; the scale values have generic defaults |
| The documents and the app change together | One repository, one build, and a test that checks each cited line |
