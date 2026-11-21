# AI Factory Explorer, milestone 2b: sourcing notes

**Use:** the facts that the milestone 2b catalog cites: the factory overview, the Ethernet, storage, control-plane, and out-of-band networks, the edge, and the facility.
Two research agents collected them on 2026-10-12: one searched this repository (each fact with its `file:line`), one read vendor pages with a web fetch tool that returns summaries.
A value that no source gave is marked NOT FOUND. A conflict between sources is marked CONFLICT; the app shows it.

## 1. NVIDIA DGX SuperPOD B300 XDR: the networks outside the compute fabric

Base: <https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-b300-xdr/latest/>

- Table 7 (`components.html`) gives one size only: 8 SU, 576 nodes, AC power.
  The page says the counts are "representative of the configuration and must be finalized based on actual design."
  - Storage, InfiniBand option: 16 leaf switches on the DGX side, 8 on the storage side, 8 spine switches (NDR).
  - Storage, Ethernet option: 16 leaf switches on the DGX side (SN5610), 4 on the storage side, 12 spine switches.
  - In-band: 6 leaf and 2 spine switches, SN5610.
  - Out-of-band: 69 SN2201 switches.
  - UFM: 2 "UFM Appliance 3.5".
  - Management: 7 control nodes.
  - Racks: 144 for DGX systems and 48 for "Switches and Management" (the table does not label the rows as racks).
  - Counts for 1, 2, or 4 SU: NOT FOUND (checked: `components.html`, `network-fabrics.html`, `storage-architecture.html`, `management-servers.html`).
- `management-servers.html`: "Base Command Manager in High Availability (HA): 2 Nodes, connects to Inband and OOB";
  Kubernetes management, 3 nodes (in-band and storage); Slurm login, 2 nodes (in-band and storage);
  "All devices connect to OOB with 1GbE for IPMI/Redfish as well."
- `network-fabrics.html`:
  in-band SN5610; out-of-band SN2201 (AC) or SN2201_M (DC); storage MQM9700-NS2R / MQM9701-NS2R (InfiniBand) or SN5610 / SN5600D (Ethernet);
  customer edge "at least 2x 100GbE links with DR1 single-mode connectivity", with BGP peering that announces the in-band and out-of-band routes;
  a pair of border leaf switches if the customer has no DR1;
  "User storage is connected to the leaf-layer SN5610";
  the out-of-band network is a dedicated VXLAN in the aggregation layer of each SU.
- `storage-architecture.html`, Table 5, in GB/s: 1 SU read 80 (standard) or 250 (enhanced), write 40 or 124; 8 SU read 640 or 2000, write 320 or 992.

## 2. Switch hardware

- Quantum-X800 Q3400-RA (<https://networking-docs.nvidia.com/xdrswitcheshw/specifications>): 4U; 2,900 W typical with passive cables; 7,000 W maximum with active cables.
- Quantum-2 QM9700 (<https://networking-docs.nvidia.com/qm97x0hw/specifications>): 1U (manual title); 32 OSFP cages; 747 W typical; 1,720 W maximum.
- Spectrum-4 SN5600 and SN5610 (<https://networking-docs.nvidia.com/sn5000hw/introduction>): 2U, 88 mm; SN5610 has 64 OSFP ports of 800GbE and 2 SFP28; 900 W typical with passive cables, 2.08 kW with 64 optical modules.
- Spectrum-3 SN4700 (<https://networking-docs.nvidia.com/sn4000hw/specifications>): 32 QSFP-DD ports, 1 to 400GbE; 44 mm high (1U); 630 W typical.
  - CONFLICT: the specification page and the VAST switch page give 12.8 Tb/s; the 2a sourcing note gave 25.6 Tb/s from a search result. The catalog uses 12.8 Tb/s.
- SN2201: 48 RJ45 1GbE ports and 4 QSFP28 100GbE ports, 1U (`docs/superpowers/specs/2026-10-12-ai-factory-explorer-m2a-sourcing.md`, section 1). Power: NOT FOUND.

## 3. VAST Data

- Repository: "CBox = chassis holding four CNodes"; DBox = NVMe-oF flash enclosure; DNode = the NVMe-oF controller card of a DBox; EBox runs both CNode and DNode containers (`sources/7-rafay-and-vast.md:210`; `modules/m08-storage-and-data-path/README.md:19`).
- CONFLICT: the 6th-generation CBox datasheet (<https://kb.vastdata.com/docs/smc-6th-generation-cbox-datasheet.md>) describes a 1U single-server node with 4 × 200GbE or NDR200. The catalog keeps "four CNodes" from the repository and shows the conflict.
- DBox Ceres DF-3015V2 / DF-3060V2 (<https://kb.vastdata.com/docs/dbox-df-3015v2df-3060v2-ceres-datasheet>): 1U; 4 × 200GbE or 4 × HDR200; 22 E1.L NAND SSDs and 8 U.2 SCM SSDs; 2 active/active fabric modules (DTrays), each with a BlueField-3.
- EBox Gen2 (<https://kb.vastdata.com/docs/ebox-gen-2.md>): 1U or 2U; 2 × ConnectX-7 400G.
- Client paths: NFS v3/v4 over TCP or RDMA with the VAST-NFS multipath client and GPUDirect Storage; S3; SMB (`sources/7-rafay-and-vast.md:211`).
  nconnect: about 8 TCP connections, or 2 RDMA connections (minimum 8), for each 100 Gb/s (`sources/7-rafay-and-vast.md:213`; `handbook/command-reference.md:98`).
- VIP pools: client load balancing and failover, CNode port membership, tenant scope, VLAN tags, BGP (`sources/7-rafay-and-vast.md:217`).
  L3 mode uses BGP with FRR (<https://kb.vastdata.com/docs/vastos-network-configuration-guide.md>).
- VMS, the REST API, the Prometheus exporter, and Call Home on TCP 443 (`sources/7-rafay-and-vast.md:219-229`).
- The storage leaf switches run RoCE QoS (`handbook/command-reference.md:147`); the storage network is Ethernet RoCE, apart from the InfiniBand compute fabric (`modules/m03-compute-fabric/README.md:22`).
- Ceph and Linstor, 3 nodes each, role not decided (`plan/requirements-map.md:32`, `:286`).
- The VAST port layout on NVIDIA Spectrum switches: NOT FOUND.

## 4. Control plane

- Rafay controller: the controller and a Management Operator in each cluster (`sources/7-rafay-and-vast.md:110`);
  self-hosted HA is 3 masters and at least 1 worker (`sources/7-rafay-and-vast.md:145`);
  Rafay's page says "High Availability (HA) Controller: minimum 3 nodes (required for all production deployments)" (<https://docs.rafay.co/selfhosted/airgapped/pre-requisites/>).
- Rafay DNS names: console, ops-console, api, fluentd-aggr (`sources/7-rafay-and-vast.md:150`).
- Rafay load balancer: optional; path 1 does SSL offload for the UI names; path 2 is SSL/TCP passthrough for the mTLS backends; health check `/healthz/ready` (`sources/7-rafay-and-vast.md:151`; `handbook/runbook-catalog.md:107`).
- Rafay backup: Velero to an S3 store; restore to a new controller, then a DNS cutover (`sources/7-rafay-and-vast.md:164-168`).
- UFM: 2 units, active and standby (`plan/requirements-map.md:29`); Pacemaker and DRBD, `ufm_ha_cluster failover` and `takeover` (`sources/2-networking.md:104`);
  a virtual management IP for the master (<https://networking-docs.nvidia.com/ufmxdrenterpriseappsw/251/high-availability>).
- Base Command Manager: a primary and a secondary head node, an external and an internal virtual IP, and a NAS for `/cm/shared` and `/home`
  (<https://docs.nvidia.com/dgx-superpod/deployment-guide-dgx-superpod/latest/high-availability.html>).
- Kubernetes: the GPU Operator (driver, toolkit, device plugin, DCGM exporter) in namespace `gpu-operator` (`handbook/command-reference.md:117`).
- Slurm: slurmctld, slurmd, accounting, GRES, topology, prolog and epilog (`modules/m10-fleet-lifecycle/README.md:20`).

## 5. Ethernet, edge, and the enterprise network

- SN5610 frontend leaf-spine with storage and control-plane leaf pairs, and SN4700 with ConnectX-6 at 100G for the control plane: the site design (`plan/requirements-map.md:30`).
- RoCE QoS on the switch: PFC on priority 3, ECN on TC3, CNP on priority 6 (`sources/2-networking.md:111`); the NIC side is set apart (`sources/2-networking.md:112`).
- Netris: a controller of 3 or more nodes, an agent on each switch, an optional SoftGate; the switches keep their configuration when the controller is not reachable (`sources/2-networking.md:114`); scope open (`plan/requirements-map.md:285`).
- Edge of the site: a firewall, 2 edge routers, a 200G uplink to the ISPs; the load balancer for the control-plane VIP is open (`plan/requirements-map.md:31`).
- The enterprise network team owns routing, the firewall, DNS, NTP, and IPAM (`modules/m03-compute-fabric/README.md:25`).
- chrony (`sources/2-networking.md:117`); clock skew makes a node NotReady (`sources/2-networking.md:118`).

## 6. Telemetry and tenancy

- dcgm-exporter on port 9400 (`handbook/command-reference.md:133`); node exporter on port 9100 (`handbook/command-reference.md:134`).
- The telemetry layers: GPU, fabric (UFM, switches), platform (Rafay, namespace `rafay-infra`), out-of-band (BMC, CDU, facility) (`modules/m05-observability-and-slos/README.md:18-21`).
- iDRAC Redfish to Prometheus (`modules/m05-observability-and-slos/README.md:23`); Alertmanager to the ITSM and the SIEM (`modules/m05-observability-and-slos/README.md:49`); ServiceNow without integration (`plan/requirements-map.md:36`).
- Tenants: customer tenants, tenants with no GPU, and a UAT tenant (`plan/requirements-map.md:34`); VAST tenants by VIP pool and VLAN (`sources/7-rafay-and-vast.md:233`); Rafay soft tenancy, Netris hard tenancy (`sources/2-networking.md:116`).

## 7. Facility

- Tier III, a 24x7 facility team, no smart hands, a BMS engineer planned (`plan/requirements-map.md:28`).
- The power path: substation, UPS, generators; hot-aisle containment and heat exchangers; liquid cooling with CDUs (`modules/m01-accelerator-hardware/README.md:16`).
- CDU, coolant, and leak detection (`handbook/concepts.md:15`); the blast radius of one PDU, CDU, or row (`handbook/concepts.md:16`).
- Runbooks F1 (CDU or coolant loop alarm), F2 (rack power event), F3 (emergency thermal shutdown) (`handbook/runbook-catalog.md:152-154`).
- Models, counts, and kW of the UPS, generators, PDUs, CDUs, and BMS: NOT FOUND.

## 8. Gaps

- No site rack layout, U positions, or port map; no IP plan, VLAN IDs, or PKey values.
- No rack units for a DGX B300.
- No VAST port layout on the switches; the CNode to storage leaf cabling in the app is assumed.
- No per-size counts of the in-band, storage, or out-of-band switches except the 8 SU row of the XDR RA and the Enterprise RA converged table.
