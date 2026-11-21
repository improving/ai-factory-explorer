# AI Factory Explorer, milestone 2b-ii: sourcing notes

**Use:** the facts that the rack elevation and the port map cite: the rack units, the rack layout, the port names of the servers and switches, and the cables and transceivers of each tier.
Two research agents collected them on 2026-10-12: one searched this repository (each fact with its `file:line`), one read vendor pages with a web fetch tool that returns summaries.
A quote marked (PDF) comes from the text of the PDF; the other vendor quotes come through the fetch tool.
A value that no source gave is marked NOT FOUND. A conflict between sources is marked CONFLICT; the app shows it.

## 1. What the repository asks for

- M3 lab step 5: "Compare the `ibnetdiscover` output (or the NetQ inventory) with the cabling LLD and the port map. Report each difference.
  This is the port-map validation of the implementation phase." (`modules/m03-compute-fabric/README.md:49`).
- The check of M3: "Find one difference between the port map and `ibnetdiscover`, and name the cable." (`modules/m03-compute-fabric/README.md:14`);
  "Each difference between the port map and `ibnetdiscover` names both ends of the cable." (`modules/m03-compute-fabric/README.md:84`).
- Onsite procedure L11: "Find the port on both ends with the port map; confirm the link on the switch and on the node before you touch it." (`handbook/onsite-procedures.md:65`).
- Onsite procedure L14: "Update the port map for each cable that moved." (`handbook/onsite-procedures.md:84`).
- The commands: `iblinkinfo` (`handbook/command-reference.md:71`), `ibnetdiscover` "Port-map validation against the LLD; a cable moved" (`handbook/command-reference.md:72`), `mlxlink` (`:75`), and `lldpctl` or `nv show interface <port> lldp` for a RoCE fabric (`:77`).
- RoCE cabling check: "the LLDP neighbour of each port agrees with the port map" (`handbook/cluster-onboarding.md:288-291`).
- The columns of a port map, the cable labels, and the file format: NOT FOUND (checked: `modules/`, `handson/`, `handbook/`, `plan/`, `sources/`).
  The only rule is "both ends of the cable".

## 2. Rack units and rack layout

- DGX B300: 10 RU (<https://docs.nvidia.com/dgx/dgxb300-user-guide/introduction-to-dgxb300.html>).
- DGX B200: 10U (<https://docs.nvidia.com/dgx/dgxb200-user-guide/introduction-to-dgxb200.html>); DGX H100: 8U (<https://docs.nvidia.com/dgx/dgxh100-user-guide/introduction-to-dgxh100.html>).
- Dell XE9780 / XE9785 air: 10U (`handbook/hardware-matrix.md:19`).
- B300 XDR RA: "four DGX B300 fit within a single rack" and "three (3) 2U rack PDUs"
  (<https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-b300-xdr/latest/dgx-superpod-architecture.html>).
- B300 data center guide (<https://docs.nvidia.com/dgx-pdf/data-center-best-practices-with-dgx-b300-v1.pdf>, PDF):
  - high density: "4 B300 Systems Per Rack … Four 1U 33kW DC Power Shelves per Rack", a 48U MGX rack with a rear DC busbar;
  - low density: "2 B300 Systems Per Rack … AC Rack PDUs";
  - rack size: "48U Height 2236mm (88 Inches) Width 600mm Depth 1068mm"; the low-density rack is "48U/52U".
- H100 and B200 RAs: the systems per rack "can be adjusted to meet local data center requirements, such as maximum power per rack"
  (<https://docs.nvidia.com/dgx-superpod/reference-architecture-scalable-infrastructure-h100/latest/dgx-superpod-architecture.html>).
- The U position of each server, switch, and PDU in a rack: NOT FOUND (images only).

## 3. Where the switches sit

- The XDR RA lists 144 racks "for DGX systems" and 48 for "Switches and Management" at 8 SU (`docs/superpowers/specs/2026-10-12-ai-factory-explorer-m2b-sourcing.md:19`).
- The XDR RA shows "Management Equipment in Rack … networking switches, management servers, storage arrays, and UFM appliances" (Figure 3 of the architecture page above).
- The B300 data center guide (PDF) draws "DGX B300 Racks 16 … Network Management & Storage Racks 8" for a 64-node SU,
  and says "Proximity of the cabinets is governed by cable distance limits".
- GB200 RA: "8 leaf switches (one for each compute rack)"
  (<https://docs.nvidia.com/dgx-superpod/reference-architecture-scalable-infrastructure-gb200/latest/network-fabrics.html>);
  it does not say where in the rack the leaf sits.
- No page says in which rack, or at which U, a leaf or a spine sits: NOT FOUND.

## 4. Rack power

- B300 XDR RA: "The rack-level power consumption per rack is ~56kW." (architecture page above).
- CONFLICT: the B300 DC RA says "exceeds 50 kW"
  (<https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-b300/latest/dgx-superpod-architecture.html>);
  the data center guide (PDF) says "58kW Average 76kW Peak" for a 4-system rack. 4 × 14.5 kW = 58 kW.
- H100 RA: "power consumption per rack exceeds 40 kW"; B200 RA: "exceeds 25 kW"
  (<https://docs.nvidia.com/dgx-superpod/reference-architecture-scalable-infrastructure-b200/latest/dgx-superpod-architecture.html>).
- NVL72: 8 power shelves, each "six 5.5kW PSUs … up to 33kW" (<https://docs.nvidia.com/pdf/dgx-spod-gb300-ra.pdf>, PDF);
  a GB300 rack "requiring up to 142 kW" (<https://docs.nvidia.com/enterprise-reference-architectures/nvl72-ai-factory/latest/components.html>).
- PDU models and counts for H100, B200, and NVL72 racks: NOT FOUND.

## 5. The NVL72 rack

- "Each DGX GB300 rack is built with 18 compute trays and 9 NVLink switch trays." (GB300 RA, PDF).
- "All NVLink interconnections are done through the rear-side, blind-mate connectors to the cable cartridges" (GB300 RA, PDF).
- "All network ports are located at the front-side of the rack" (GB300 RA, PDF).
- The GPUs and CPUs are liquid-cooled; the other parts are air-cooled (GB300 RA, PDF).
- The order and the U positions of the trays and the power shelves, the rack height in U, and the manifold: NOT FOUND.
  The app keeps its 2a assumption (10 compute trays, the 9 switch trays, 8 compute trays; `src/catalog/nvl72.ts`).

## 6. Server ports

- DGX B300: "All I/O connectivity is moved to the front of the system"; 8 OSFP ports (OSFP1 to OSFP8) on 8 ConnectX-8 cards, each with P1 (left) and P2 (right);
  for example OSFP1 P1 is `mlx5_22`, OSFP1 P2 is `mlx5_23`; two dual-port BlueField-3 in Slot1 and Slot2 (B300 user guide above).
  The other `mlx5` names of the B300: NOT FOUND (the fetch gave OSFP1 only).
- DGX B200 (B200 user guide above): 4 OSFP cages with P1 and P2:
  OSFP1P1 `mlx5_15`, OSFP1P2 `mlx5_10`, OSFP2P1 `mlx5_14`, OSFP2P2 `mlx5_13`, OSFP3P1 `mlx5_8`, OSFP3P2 `mlx5_7`, OSFP4P1 `mlx5_9`, OSFP4P2 `mlx5_4`;
  the GPUs of these ports are 7, 4, 6, 5, 2, 1, 3, 0.
- DGX H100 (H100 user guide above): "Four OSFP ports (OSFP1 through OSFP4) connect to eight single-port ConnectX-7 InfiniBand cards. Each OSFP port has two sub-ports, P1 and P2.";
  OSFP1P1 `mlx5_11`, OSFP1P2 `mlx5_6`, OSFP2P1 `mlx5_10`, OSFP2P2 `mlx5_9`, OSFP3P1 `mlx5_4`, OSFP3P2 `mlx5_3`, OSFP4P1 `mlx5_5`, OSFP4P2 `mlx5_0`;
  Slot1 `mlx5_7` / `mlx5_8`, Slot2 `mlx5_1` / `mlx5_2`.
- The repository gives the same GPU order for the OSFP ports of the H100 and the B200 (`docs/superpowers/specs/2026-10-12-ai-factory-explorer-m2a-sourcing.md:61`).
- GB300 tray: four ConnectX-8 for the compute fabric and one BlueField-3 for in-band and storage (GB300 RA, PDF).
  CONFLICT: the NVL72 AI factory page says "four dual-port ConnectX-8 SuperNICs". The port names of a tray: NOT FOUND.
- The physical position of the ports on the panel: NOT FOUND (images only).

## 7. Switch ports

- Q3400: "144 XDR ports over 72 OSFP cages" (<https://networking-docs.nvidia.com/xdrswitcheshw/introduction>);
  "Each OSFP cage physically holds two separate ports that are labeled sw1p1 and sw1p2 (for cage 1)";
  a splitter end marked "1" or "2" is `<cage>/1` or `<cage>/2` in the CLI (<https://networking-docs.nvidia.com/xdrswitcheshw/cable-installation>).
- QM9700: 32 OSFP cages, 64 NDR ports; "each cage in the system's front panel holds two ports from the same ASIC, and the cage numbers are global";
  "Splitting a port changes the notation of that port from x/y/z to x/y/z/i" (<https://networking-docs.nvidia.com/qm97x0hw/cable-installation>).
- SN5610: 64 OSFP 800GbE ports and 2 SFP28 (`docs/superpowers/specs/2026-10-12-ai-factory-explorer-m2b-sourcing.md:36`).
- Which leaf port takes which server: NOT FOUND. The position of the cages (top or bottom row): NOT FOUND (images only).

## 8. Cables and transceivers

- B300 XDR RA components (<https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-b300-xdr/latest/components.html>; "must be finalized based on actual design"):
  - server to leaf: "NVIDIA OSFP twin port flat top transceiver, MMF passive fiber cable";
    DGX-side transceiver 980-9IATO-00XM00, leaf-side twin-port OSFP 980-9IAH1-00XM00, cable 980-9I570-00N030;
  - leaf to spine: twin-port OSFP 980-9IAH1-00XM00 and the MMF cable 980-9I570-00N030;
  - InfiniBand storage: 400G QSFP 980-9I693-00NS00 on the node, twin-port OSFP 980-9I510-00NS00 on the leaf;
  - Ethernet storage: QSFP 400G 980-9I693-F4NS00 on the node, finned twin-port OSFP 980-9I510-F4NS00 on the switch;
  - in-band: cable 980-9I557-00N030, twin OSFP 980-9I510-F4NS00.
- NDR cabling guide (<https://docs.nvidia.com/dgx-superpod/design-guide-cabling-data-centers/latest/ndr-components.html>):
  "The finned OSFP version has 'twin' ports … only used in switch ports." and "The flat OSFP connector is single-port and is used for adapter connections."
- MMA4Z00-NS: "800Gb/s Twin-port OSFP, 2x400Gb/s Multimode 2xSR4, 50m" (<https://docs.nvidia.com/networking/display/800gmma4z00ns>, page title).
- MCP4Y10 passive DAC, OSFP to OSFP 800G: "0.5, 1, 1.5, and 2-meter lengths", for "switch-to-switch and switch-to-DGX-H100" (<https://networking-docs.nvidia.com/mcp4y10nxxx2x400pub>).
- Cable guide (HDR): "Due to their short reach, copper cables are mainly used within a rack." (<https://docs.nvidia.com/dgx-superpod/design-guide-cabling-data-centers/latest/cable-tech.html>).
- XDR DAC and ACC part numbers and lengths: NOT FOUND (a search snippet says DAC is too short at 200G-PAM4; the page did not open).
- GB300 and H100/B200 RA cable part numbers: NOT FOUND.

## 9. Conflicts and gaps that the app shows

- CONFLICT: B300 rack power (~56 kW, more than 50 kW, 58 kW average and 76 kW peak).
- CONFLICT: the GB300 tray NICs ("four ConnectX-8 NICs" against "four dual-port ConnectX-8 SuperNICs").
- The B300 DC RA (64 nodes for each SU) is the RA of the Spectrum-X design of the app (`b300-spx`); its rack power and power shelves go to that design.
- Gaps: the U positions, the rack of each switch, the leaf port of each server, the cable lengths, and the port-map columns.
  The app draws a generic layout and marks these values `assumed`, as the spec says for a value that no source gives.
