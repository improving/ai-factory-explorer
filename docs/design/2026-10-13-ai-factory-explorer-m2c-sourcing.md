# AI Factory Explorer, milestone 2c: sourcing notes

**Use:** the facts that the overlays (network layers, tenancy, telemetry, ownership, node state, phase), the Owner/Tool tab of the inspector, and the new node-view parts cite.
Two research agents collected them on 2026-10-13: one searched this repository (each fact with its `file:line`), one read vendor pages with a web fetch tool that returns summaries.
A value that no source gave is marked NOT FOUND. A conflict between sources is marked CONFLICT; the app shows it.

## 1. Ownership

The repository has no table of part → owner. The owners come from the scope and the handoff rules:

- The partner operates the cluster: "accountable for the cluster health across compute, GPU, InfiniBand, Ethernet, storage integration, operating system, cluster management, and orchestration" (`plan/requirements-map.md:15-17`).
- The facility team: "The customer's facility team keeps the building: power, cooling, access, and environment." (`plan/requirements-map.md:18`);
  handoff for "Power, cooling, leak, access, a work permit (procedure L13)" (`handbook/shift-discipline.md:69`); the partner does "No facility work" (`handbook/onsite-procedures.md:18`).
- The enterprise network team: "dependencies outside the cluster (DNS, NTP, IPAM, the firewall, upstream routing) that belong to the enterprise network team, with a handoff rule" (`modules/m03-compute-fabric/README.md:25`);
  the escalation row "DNS, NTP, IPAM, the firewall, upstream routing (runbook N10)" (`handbook/shift-discipline.md:70`).
- The edge devices are "outside the cluster boundary (section 14)" (`plan/requirements-map.md:123`).
- Rafay: "a public portal for external customers (Rafay's responsibility)" (`plan/requirements-map.md:33`).
- The customer workload: "Infrastructure-caused workload failures; handoff above the managed boundary" (`plan/requirements-map.md:137`); customer code is out of scope (`plan/requirements-map.md:77`).
- VAST array administration: open — "bullet 1 puts this in scope; bullet 5 and section 14 exclude array administration. Ask the customer." (`plan/requirements-map.md:139`).
- The OEM and the platform vendor (L4): "OEM and platform defects, firmware defects, RMA | The partner manages it to closure" (`plan/requirements-map.md:54`).
- One owner: "do not close or reassign an incident because the fault is with a supplier" (`handbook/shift-discipline.md:72`).
- The control-plane load balancer is open (`plan/requirements-map.md:31`, `:288`).

## 2. Tools ("Seen in") and operator levels ("Operated by")

Section 3 of the requirements map is a table of tool layers with a column "Who operates it (proposed)" (`plan/requirements-map.md:160-174`):

| Layer | Tool | Operated by | Source |
|-------|------|-------------|--------|
| GPU | DCGM | "L2 runs; L3 sets the diagnostics levels and the RMA thresholds" | `plan/requirements-map.md:164` |
| Cluster management | Base Command Manager, Mission Control | "L2 runs; L3 owns the images and the upgrade flow" | `plan/requirements-map.md:165` |
| InfiniBand | UFM and switch telemetry | "L2 reads; L3 changes routing, partitions, firmware" | `plan/requirements-map.md:166` |
| Ethernet | NetQ; NMX for the NVLink switches of rack-scale systems | "L2 reads; L3 changes" | `plan/requirements-map.md:167` |
| Server hardware | iDRAC, OpenManage, or the OEM suite | "Onsite and L2" | `plan/requirements-map.md:168` |
| Kubernetes | Rafay ("the primary monitoring tool") | "L2 runs; L3 platform SME owns the operators" | `plan/requirements-map.md:169` |
| Enterprise observability | Alertmanager, ServiceNow (no integration), the SIEM | "L2 configures the routes; service management owns the ITSM side" | `plan/requirements-map.md:170` |
| Automation | NVSentinel, GPUd | "L3 defines the allow-list; L2 operates" | `plan/requirements-map.md:171` |

- The column is a proposal: "It is not in the RFP." (`plan/requirements-map.md:173`).
- L1: "L1 uses all these tools through dashboards, alerts, and the read-only views only, and runs the runbook steps that the runbook permits (proposed)." (`plan/requirements-map.md:174`);
  "Read, do not change." (`handbook/l1-primer.md:14`).
- Cordon and drain are L2 work (`handbook/l1-primer.md:37`); L2 does "the drain and return of nodes, OEM cases and RMA evidence" (`plan/role-paths.md:152`).
- VAST: VMS and `vastpy-cli` (`handbook/command-reference.md:106`).
- The runbook catalog has no tool or level column (`handbook/runbook-catalog.md:37`).
- Caution: "L1-L8" in `handbook/b300-nvl72-forum-triage-guide.md:4` are stack layers, not operator levels.

## 3. Tenancy

- Tenants: "customer tenants; NOC, Management, and Storage tenants with no GPU; a UAT tenant with GPUs for tests. The quotas come at deployment." (`plan/requirements-map.md:34`).
- Rafay: "One organization for each tenant." and "Operations tenants with no GPU access." (`modules/m09-platform-kubernetes-rafay/README.md:28-33`).
- Isolation: "Tenant isolation: PKeys, VLAN and VRF, and DPU-based isolation." (`handbook/concepts.md:65`); runbook N8 "Tenant isolation fault (PKey or VLAN/VRF configuration)" (`handbook/runbook-catalog.md:80`).
- VAST: "isolation is enforced through VIP-pool/VLAN segmentation, per-tenant client-IP allow-lists, and per-tenant S3 access/secret keys" (`sources/7-rafay-and-vast.md:233`).
- CONFLICT: the Rafay hierarchy gives "Projects (hard tenancy ...) → Workspace Role / Namespace (soft tenancy)" (`sources/7-rafay-and-vast.md:132`);
  the networking source calls Rafay soft tenancy and Netris hard tenancy (`sources/2-networking.md:116`).
- The tenant counts and the servers of each tenant: NOT FOUND ("The quotas come at deployment").

## 4. Telemetry

- The chain: "dcgm-exporter, UFM, iDRAC Redfish, NetQ → Prometheus → Alertmanager → ITSM or a manual ticket" (`docs/superpowers/specs/2026-10-12-ai-factory-explorer-design.md:268`).
- dcgm-exporter: "-a, --address <host:port> | DCGM_EXPORTER_LISTEN | :9400"
  (<https://docs.nvidia.com/datacenter/dcgm/latest/reference/command-line-reference/dcgm-exporter.html>); `handbook/command-reference.md:133`.
- Node exporter on port 9100 (`handbook/command-reference.md:134`).
- Rafay managed Prometheus "automatically scrapes the GPU metrics" (`sources/7-rafay-and-vast.md:186`); namespace `rafay-infra` (`modules/m05-observability-and-slos/README.md:20`).
- iDRAC: "iDRAC telemetry exports through Redfish to Prometheus" (`modules/m05-observability-and-slos/README.md:23`).
- VMS: a "built-in Prometheus exporter (4.7+)" (`sources/7-rafay-and-vast.md:225`).
- NMX only for rack-scale systems (`sources/2-networking.md:110`).
- Alertmanager: "The routing tree: to the ticketing system (ITSM) and to the SIEM through webhooks." (`modules/m05-observability-and-slos/README.md:49`).
- ServiceNow: "No integration with Rafay at this stage" (`plan/requirements-map.md:36`); "L1 opens the tickets by hand" (`plan/requirements-map.md:125`).
- The SIEM: "site-specific" (`plan/requirements-map.md:170`).
- Network devices in Rafay observability: not confirmed (`sources/7-rafay-and-vast.md:189`).

## 5. Node states

- The capacity view: "total, available, allocated, degraded, quarantined, maintenance" (`plan/requirements-map.md:142`); the spare pool (`modules/m10-fleet-lifecycle/README.md:29`).
- The state machine of M10 uses other names: "healthy, degraded, quarantined, in repair, awaiting RMA, in burn-in, returned" (`modules/m10-fleet-lifecycle/README.md:23`).
- Quarantined: "A node or rack that is slower than its peers goes to a test reservation (the quarantined state)" (`handbook/cluster-onboarding.md:429`).
- Procedure L1: "Node drain, repair, burn-in, and return to service" (`handbook/runbook-catalog.md:160`); uncordon "Only after the return-to-service tests of the node state machine" (`handbook/command-reference.md:159`).
- The state of each node at a site: NOT FOUND (it is live data).

## 6. Delivery phases

- "two phases of equal size; phase 1 arrives in weeks. Each phase has its own acceptance window." (`plan/requirements-map.md:27`).
- "The cluster arrives in two phases: do this checklist in the acceptance window of each phase." (`handbook/cluster-onboarding.md:499-500`).
- Which SUs are in phase 1: NOT FOUND.

## 7. Node-view parts

Pages: DGX B300 user guide (<https://docs.nvidia.com/dgx/dgxb300-user-guide/introduction-to-dgxb300.html>), DGX B200 user guide (<https://docs.nvidia.com/dgx/dgxb200-user-guide/introduction-to-dgxb200.html>), DGX H100 user guide (<https://docs.nvidia.com/dgx/dgxh100-user-guide/introduction-to-dgxh100.html>), GB200 user guide hardware page (<https://docs.nvidia.com/dgx/dgxgb200-user-guide/hardware.html>).

- Power supplies:
  - DGX B300: "12 power supply units (PSU) configured for N+N redundancy"; "3.3 kW @ 200-240 V, 16 A". CONFLICT: the feature table gives "12 x 3.2 kW".
  - DGX B200: "six power supply units (PSU) configured for 5+1 redundancy", "3,300 W".
  - DGX H100 and H200: "six power supply units (PSU) configured for 4+2 redundancy", "6 x 3.3 kW".
  - Dell XE9780 (air): "12x 3200 W Titanium ... hot-swap redundant PSUs" (`sources/1-gpu-node.md:88`).
  - NVL72: the power shelves of the rack, "N+N redundancy" (GB200 hardware page). CONFLICT: the GB200 SuperPOD page says "configured as N redundancy".
- Fans: the fan count of a DGX system: NOT FOUND. Dell XE9780: "15 'Standard grade' GPU fans, all hot-swap, plus 5 ... CPU fans, all cold-swap" (`sources/1-gpu-node.md:90`).
  CONFLICT: the B300 user guide says "All cooling fans are accessible from the rear" and "The front of the system provides access to the fans".
- Memory and CPU:
  - DGX B300: "2 x Intel Xeon Platinum 6776P processors"; 2 TB, "configurable on-site with 128 GB DIMMs".
  - DGX B200: "2 TB using 32 x DIMMs"; "2 x Intel Xeon 8570 ... with 56 cores each".
  - DGX H100: "2 TB using 32 x DIMMs"; "2 x Intel Xeon 8480C ... with 56 cores each".
  - GB200 superchip: "72 Arm Neoverse V2 cores", LPDDR5X "Up to 480 GB" (<https://www.nvidia.com/en-us/data-center/gb200-nvl72/>).
  - CONFLICT: the GB300 LPDDR5X of a tray: "1TB aggregated" (<https://docs.nvidia.com/enterprise-reference-architectures/nvl72-ai-factory/latest/components.html>) against 17 TB ÷ 18 trays (<https://www.nvidia.com/en-us/data-center/gb300-nvl72/>).
- NVMe:
  - DGX B300: "2 x 1.92 TB M.2 NVMe" and "8 x E1.S 3.84 TB NVMe".
  - DGX B200 and H100: "2 x 1.92 TB NVMe M.2 SSD (ea) in RAID 1 array" and "8 x 3.84 TB NVMe U.2 SED (ea) in RAID 0 array".
  - GB200 tray: "4x 3.84TB E1.S NVMe per compute tray with software RAID 0" and "1x 1.92TB M.2 NVMe".
- `nvidia-smi topo -m` (<https://docs.nvidia.com/deploy/nvidia-smi/index.html>): "SYS = Connection traversing PCIe as well as the SMP interconnect between NUMA nodes",
  "NODE = ... the interconnect between PCIe Host Bridges within a NUMA node", "PHB = ... a PCIe Host Bridge (typically the CPU)", "PXB = ... multiple PCIe switches", "PIX = ... a single PCIe switch", "NV# = ... a bonded set of # NVLinks".
  - The pass rule: "each GPU and its NIC are under the same PCIe switch (PIX or PXB), on the same NUMA node" (`handbook/cluster-onboarding.md:161`).
  - The mock B300 profile: NV18 between all GPUs; "GPU0-GPU3 share NUMA node 0, and GPU4-GPU7 share NUMA node 1" (`handson/11-dcgm-nvlink-fabric/README.md:33-44`).
  - A published GPU-NIC matrix (which NIC is PIX to which GPU) for DGX H100, B200, or B300: NOT FOUND.
- Node services:
  - Fabric Manager: "a privileged daemon that configures NVSwitch memory fabrics"; DGX and HGX B200 and B300 "require an additional NVLSM service" (<https://docs.nvidia.com/datacenter/tesla/fabric-manager-user-guide/index.html>).
  - IMEX: "Runs exclusively on compute nodes" (<https://docs.nvidia.com/multi-node-nvlink-systems/imex-guide/overview.html>).
  - The GPU Operator deploys "the NVIDIA GPU driver, NVIDIA Container Toolkit, NVIDIA Device Plugin, DCGM Exporter, and MIG Manager" (<https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/getting-started.html>); namespace `gpu-operator` (`handbook/command-reference.md:117`).

## 8. Gaps

- No part → owner table; no part → tool table (only the layers); the operator levels are a proposal.
- No tenant counts, no node state data, no phase of each SU: they are site or live data. The app uses example values that you set, marked `assumed`.
- No fan count for a DGX system; no GPU-NIC PCIe matrix for any DGX.

## 9. Node-view references in the repository (2c-ii)

The Learn and Signals tabs of the new parts cite these lines.
Abbreviations: RC = `handbook/runbook-catalog.md`, CR = `handbook/command-reference.md`, CO = `handbook/cluster-onboarding.md`, OP = `handbook/onsite-procedures.md`.

- PSU: no runbook for a server PSU (F2, RC:153, is the rack power).
  The acceptance check "each PSU is present and redundant" (CO:123); `ipmitool sensor` (CR:40) and `ipmitool sel list` (CR:41); L9 physical check (RC:168).
- Fans: G6 thermal or power throttle (RC:44); "the GPU fans are hot-swap and the CPU fans are cold-swap" on the XE9780 (OP:57); "the PSUs, fans, and temperatures are in range" (CO:149); `ipmitool sensor` (CR:40).
- DIMMs (host memory): NOT FOUND: no runbook, signal, or command for host memory errors in the repository; the ECC content is about GPU HBM (G2).
- NVMe: S5 local NVMe failure or wear (RC:93); `dmesg -T` with `nvme` (CR:42); `nvme list`, `nvme smart-log` (CR:43); "The local disks are healthy" (CO:163).
- Services: G7 Fabric Manager and NVLSM (RC:45); G10 driver mismatch (RC:48); P1 device plugin (RC:101); P2 GPU Operator crash loop (RC:102);
  `systemctl status nvidia-fabricmanager` (CR:56); `kubectl get pods -n gpu-operator` (CR:117); `curl -s localhost:9400/metrics | grep DCGM_FI` (CR:133).
  MIG Manager: NOT FOUND (no runbook, signal, or command).
- `topo -m`: CR:33; `lstopo` (CR:39); the pass rule (CO:161); M1 lab "map each GPU to its ConnectX-8 port" (`modules/m01-accelerator-hardware/README.md:66`).
