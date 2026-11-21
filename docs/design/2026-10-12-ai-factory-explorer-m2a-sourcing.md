# AI Factory Explorer, milestone 2a: sourcing notes

**Use:** the facts that the milestone 2a catalog cites.
Four research agents read these pages on 2026-10-12 with a web fetch tool that returns summaries,
so a quote can differ a little from the page text.
A value that no page gave is marked NOT FOUND.
A conflict between pages is marked CONFLICT; the catalog shows each conflict in the inspector, and it does not hide it.

## 1. DGX SuperPOD with DGX B300, XDR InfiniBand

Base: <https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-b300-xdr/latest/>

- SU = 72 DGX B300: "A modular architecture based on SUs of 72 DGX B300 systems each." (`dgx-superpod-components.html`).
  The largest tested size is 8 SU.
- Table 7 (`components.html`, 8 SU): 64 compute leaf switches (Q3400-RA) and 36 spine switches; 4608 DGX-to-leaf cables and 4608 leaf-to-spine cables.
- Figure 5 (`network-fabrics.html`): node to leaf "1 x 800 Gbps XDR"; leaf to spine "2 x 800 Gbps XDR".
- CONFLICT: Table 1 says "Rail-optimized, non-blocking, twin-plane, fat tree topology"; the components page says "rail-optimized, full-fat tree".
- Storage fabric, InfiniBand option: MQM9700-NS2R (AC) or MQM9701-NS2R (DC), NDR. Ethernet option: SN5610 (AC) or SN5600D (DC).
  DGX side "near 4:3"; storage side "1:1 port to uplink ratio".
- In-band: SN5610; 2 in-band ports for each DGX, 200 Gb/s, bonded.
- Out-of-band: SN2201, "48 port 1 Gbps Ethernet and 4 x 100 Gbps"; 69 switches for 576 DGX.
  Each DGX: 1 BMC port, and the BMCs of both BlueField cards.
- UFM: 2 UFM Appliance 3.5; "connected to four (4) FNM ports on the Q3400 switches".
- Management servers (`management-servers.html`): Base Command Manager HA, 2 nodes; Kubernetes management, 3 nodes; Slurm login, 2 nodes.
- DGX B300 ports (Figure 4): 2 groups of "Compute 4x OSFP" (8 ports); 2 storage QSFP; 2 in-band QSFP; 1 BMC RJ45 and 1 LAN port.
- Racks: "up to four DGX B300 systems per rack". Rack kW and cooling: NOT FOUND.

## 2. DGX SuperPOD with DGX B300, Spectrum-X Ethernet

Base: <https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-b300/latest/>

- SU = 64 DGX B300: "SUs of 64 DGX B300 systems each." "Each group of 64 nodes is rail-aligned."
- CONFLICT: the text says a tested system has 4 SU; a figure shows 8 SU (512 nodes).
- Table 7 (4 SU, 256 nodes): 64 SN5600 compute leaf switches and 32 spine switches; 16 leaf switches for each SU, 8 in each plane; two layers, no super-spine.
- Two planes: each GPU has "2x 400GbE connectivity through two different planes". 4096 DGX-to-leaf cables and 4096 leaf-to-spine cables.
- CONFLICT: Table 1 names Q3400 InfiniBand for the compute fabric; Table 7 and the fabric page use SN5600. The catalog uses SN5600.
- CONFLICT: "six 5.5kW Power Shelves" against "four total power shelves in a single DGX B300 rack".

## 3. Enterprise Reference Architecture for HGX AI Factory (HGX B300, Spectrum-X)

Base: <https://docs.nvidia.com/enterprise-reference-architectures/hgx-ai-factory/latest/>

- The NVIDIA Cloud Partner (NCP) RA has no public page with HGX B300 network data (NOT FOUND; access-controlled). The Enterprise RA is the public design that the catalog uses.
- SU = 4 nodes (`network-logical-architecture.html`); up to 32 SU (128 nodes, 1024 GPUs).
- Each node: 8 ConnectX-8 at 800G, each split into 2 × 400G, one to each plane; 1 BlueField-3 B3240 with 2 × 400GbE; 6 × 1G out-of-band.
- In each plane, a leaf serves 2 rails: 1+5, 2+6, 3+7, 4+8.
- Table 6, compute, both planes: 32 nodes = 8 leaf, 4 spine; 64 nodes = 16 leaf, 8 spine; 128 nodes = 32 leaf, 16 spine.
- Table 7, converged: 32 nodes = 2 leaf, no spine; 64 = 4 leaf, 2 spine; 128 = 8 leaf, 4 spine.
- CONFLICT: the logical page names SN5600 "128-port 400 GbE"; the hardware page names SN5610 "64 total ports of 800 Gbps".

## 4. DGX H100, H200, and B200, and their SuperPODs

- DGX H100/H200 (<https://docs.nvidia.com/dgx/dgxh100-user-guide/introduction-to-dgxh100.html>):
  8 GPUs; 640 GB (H100) or 1,128 GB (H200) in total; NVLink 4 at 900 GB/s;
  "4 x OSFP ports for 8 x NVIDIA ConnectX-7 Single Port InfiniBand Cards", up to 400 Gb/s;
  "2 x NVIDIA ConnectX-7 Dual Port Ethernet Cards"; 2 × Xeon 8480C; 10.2 kW maximum; 8U; air.
  NVSwitch chip count: NOT FOUND on an opened page.
- DGX B200 (<https://docs.nvidia.com/dgx/dgxb200-user-guide/introduction-to-dgxb200.html>):
  8 GPUs, 1,440 GB in total; "2 x 5th generation NVLink switches"; the same 8 × ConnectX-7 at 400 Gb/s;
  "2 x NVIDIA BlueField-3 DPU Dual Port Cards"; 2 × Xeon 8570; 14.3 kW maximum; 10U.
- Port to GPU map (Table 6, the same on H100 and B200): OSFP1P1 GPU7, OSFP1P2 GPU4, OSFP2P1 GPU6, OSFP2P2 GPU5, OSFP3P1 GPU2, OSFP3P2 GPU1, OSFP4P1 GPU3, OSFP4P2 GPU0.
- SuperPOD H100 and B200 (NDR InfiniBand): SU = 32 nodes, with one node removed for the UFM connection.
  "Traffic per rail of the DGX B200 systems is always one hop away from the other 31 nodes in a SU."
  - The B200 fabric page (<https://docs.nvidia.com/dgx-superpod/reference-architecture-scalable-infrastructure-b200/latest/network-fabrics.html>) gives:
    1 SU = 31 nodes, 8 leaf, 4 spine; 2 SU = 63, 16, 8; 3 SU = 95, 24, 16; 4 SU = 127, 32, 16.
  - CONFLICT: the H100 fabric page gives the same table, which is probably a copy.
    The H100 architecture page (<https://docs.nvidia.com/dgx-superpod/reference-architecture-scalable-infrastructure-h100/latest/dgx-superpod-architecture.html>) gives 4 SU = 128 nodes, 32 leaf, 16 spine, 8 cables for each node, no core.
  - The compute switch model is NOT FOUND on the fabric pages; the abstract names "NVIDIA NDR (400 Gbps) InfiniBand".

## 5. GB200 NVL72 and GB300 NVL72

- Rack (product pages <https://www.nvidia.com/en-us/data-center/gb200-nvl72/>, <https://www.nvidia.com/en-us/data-center/gb300-nvl72/>,
  and the user guide <https://docs.nvidia.com/dgx/dgxgb200-user-guide/dgxgb200-user-guide.pdf>):
  72 GPUs and 36 Grace CPUs; 18 compute trays (1RU), each with 2 Grace CPUs and 4 GPUs;
  9 NVLink switch trays (1RU), each with 2 NVSwitch chips with 72 NVLink ports;
  1.8 TB/s NVLink for each GPU, 18 links, one to each switch chip; 130 TB/s for the rack;
  13.4 TB HBM (GB200) or 20 TB (GB300) for the rack; 8 power shelves of 6 × 5.5 kW; about 120 kW for each rack;
  liquid cold plates for CPUs and GPUs, air for the network cards. CDU: NOT FOUND.
- Compute tray network (user guide): GB200 "4x NVIDIA ConnectX-7 single port 400G OSFP NIC"; GB300 "4x NVIDIA ConnectX-8 single port 800G OSFP NIC";
  "2x NVIDIA BlueField-3 DPU, dual port 400G"; 1 × 1GbE tray BMC and 2 × 1GbE BlueField BMC.
  - CONFLICT: the GB300 RA (<https://docs.nvidia.com/pdf/dgx-spod-gb300-ra.pdf>) says one BlueField-3 B3240 for each tray. The catalog uses the RA for GB300.
- NVLink management (user guide 4.4): the switch trays run NVOS with NVLSM, Fabric Manager, NMX-C, and NMX-T; NMX-C runs on one leader switch tray; IMEX runs on the compute trays.
- SuperPOD GB300 (the GB300 RA): SU = 8 racks = 576 GPUs, 1.2 MW; Q3400 XDR; 4 rails, 2 leaf switches for each rail, 8 leaf switches for each SU.
  Table 3: 2 SU = 16 leaf, 8 spine; 4 SU = 32, 18; 8 SU = 64, 36; 16 SU = 128, 72.
- SuperPOD GB200 (<https://docs.nvidia.com/dgx-superpod/reference-architecture-scalable-infrastructure-gb200/latest/>):
  SU = 8 racks; QM9700 NDR; 4 rails as scalable leaf groups; 8 leaf and 6 spine switches in each group; a core layer of 6 groups.
  Milestone 2a does not draw this three-layer fabric.

## 6. Switches and NICs

- QM9700 (<https://networking-docs.nvidia.com/qm97x0hw/introduction>): 64 ports of NDR 400 Gb/s, 32 OSFP, 1U, 51.2 Tb/s.
- SN5610 (<https://networking-docs.nvidia.com/sn5000hw/introduction>): 64 OSFP ports of 800GbE, 2U, 51.2 Tb/s; splits to 128 × 400GbE.
- SN4700 (<https://networking-docs.nvidia.com/sn4000hw/specifications>): 32 QSFP-DD ports of 400GbE, 25.6 Tb/s.
- SN2201 (<https://networking-docs.nvidia.com/sn2201hw/specifications>): 48 RJ45 1GbE ports and 4 QSFP28 100GbE ports, 1U.
- ConnectX-8 (<https://networking-docs.nvidia.com/connectx8hw/introduction>): up to 800 Gb/s, PCIe Gen6 x16. An integrated PCIe switch: NOT FOUND in the text.

## 7. Rail-optimized against top-of-rack

- NCCL 2.12 blog (<https://developer.nvidia.com/blog/doubling-all2all-performance-with-nvidia-collective-communication-library-2-12/>):
  "NIC-0 from each DGX system is connected to the same leaf switch (L0)";
  before NCCL 2.12, cross-rail traffic "traversed through three hops of network switches (L0, S1, and L3)".
- An NVIDIA page that describes a top-of-rack GPU fabric: NOT FOUND.
  The top-of-rack design in the app is an illustration with the status `assumed`; its counts are not RA data.

## 8. More facts that the catalog cites

The same research agents read these values on 2026-10-12; they were not in the sections above.

- B200 fabric page table (<https://docs.nvidia.com/dgx-superpod/reference-architecture-scalable-infrastructure-b200/latest/network-fabrics.html>):
  "Compute+UFM" cables 252, 508, 764, 1020 and spine-leaf cables 256, 512, 768, 1024 for 1, 2, 3, 4 SU.
  The node-leaf count includes 4 cables of the UFM for each table row.
- HGX product page (<https://www.nvidia.com/en-us/data-center/hgx/>): B200, 1.8 TB/s of NVLink for each GPU, 14.4 TB/s in total.
- DGX B200 user guide: airflow "1,550 CFM"; BMC "1 GbE RJ45 interface".
  DGX H100 user guide: "1105 CFM Front-to-Back @ 80% fan PWM"; BMC "1 GbE RJ45 interface".
- GB200 NVL72 product page: 372 GB HBM3e at 16 TB/s for each superchip (2 GPUs).
  GB200 RA components: each superchip has 1 Grace CPU and 2 GPUs, with NVLink-C2C at 900 GB/s.
- NVL72 user guide: compute tray storage "4x 3.84 TB E1.S" NVMe in RAID0 and "1x 1.92 TB M.2" for boot.
- GB200 RA architecture page and the GB300 RA: each power shelf has six 5.5 kW power supplies, "up to 33 kW";
  "Each SU requires a Thermal Design Power (TDP) of 1.2 Megawatts (MW)" (8 racks).
- GB300 RA: "one BlueFiled-3 NICs to support 2x400Gbps connectivity for the In-band Management and Storage" (the RA's spelling).
- Mission Control NVLink management page (<https://docs.nvidia.com/mission-control/docs/systems-administration-guide/2.3.1/nvlink-management-software.html>):
  "a leader switch that runs NMX-C and NMX-T". The IMEX guide says NMX-C is enabled on "only one of the L1 NVSwitch switch trays".
- GB200 RA network fabrics page and the GB300 RA: each GPU has 18 NVLink 5 links, one to each of the 18 NVSwitch chips of the rack.
- GB200 RA network fabrics page: "4x 200GbE on BlueField-3 DPUs"; the user guide says "dual port 400G".
- NVL72 user guide: "1.8 TB/s bidirectional per GPU with NVLink 5.0".
