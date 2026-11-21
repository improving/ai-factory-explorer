# AI Factory Explorer, milestone 3: sourcing notes (path tracer)

**Use:** the facts that the path tracer cites (spec section 6).
Milestone 3-i uses sections 1 to 4; milestone 3-ii uses sections 5 to 8.
Each vendor quote below was checked against the raw page text on 2026-10-13.
Each repository line was checked with `grep -n` or `sed`.

## 1. Compute paths: rails, spines, planes

- B300 XDR: "Each group of 72 nodes is rail-aligned. Traffic per rail of the DGX B300 systems is always one hop away from the other 72 nodes in a SU."
  (<https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-b300-xdr/latest/network-fabrics.html>)
- GB200: "Traffic per rail of each compute tray is always one hop away from other compute trays in the same Scalable Unit.
  Traffic between different compute racks, or between different rails, traverses the spine layer."
  (<https://docs.nvidia.com/dgx-superpod/reference-architecture-scalable-infrastructure-gb200/latest/network-fabrics.html>)
- B300 Spectrum-X: "The Spectrum-X based compute fabric features a twin-planar design"; "Each GPU has 2x 400GbE connectivity through two different planes";
  after a failure, "the application can continue to operate on ½ of the original bandwidth."
  (<https://docs.nvidia.com/dgx-superpod/reference-architecture/scalable-infrastructure-b300/latest/network-fabrics.html>)
- ECMP and adaptive routing across the spines: the RA pages name adaptive routing for the storage fabric only; ECMP and SHARP: NOT FOUND on the RA pages.
  CONFLICT in the repository: "how traffic hashes onto ECMP paths through the leaf-spine fabric" (`handson/SimAI_SimCCL_55_B300_Reference_Architecture_Labs.md:2145`)
  against "InfiniBand's LID-based unicast forwarding has **no ECMP**" (`handson/13-ibsim-real-fabric/lab06/README.md:10`).
  The tracer shows the spines of the plane as equal-cost choices and marks the choice `assumed`.
- Twin plane for B300 XDR: the XDR RA Table 1 says "twin-plane"; the app draws one 800 Gb/s cable for each GPU NIC (an existing note of the `b300-xdr` design).

## 2. PXN

- "The new feature introduced in NCCL 2.12 is called PXN, as PCI × NVLink"; it lets a GPU "first move data on a GPU on the same rail as the destination".
  (<https://developer.nvidia.com/blog/doubling-all2all-performance-with-nvidia-collective-communication-library-2-12/>)
- `NCCL_PXN_DISABLE` (since 2.12): "Disable inter-node communication using a non-local NIC, using NVLink and an intermediate GPU."; "Default is 0, set to 1 to disable this mechanism."
  (<https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/env.html>)
- Repository: `NCCL_PXN_DISABLE` (`handson/SimAI_SimCCL_55_B300_Reference_Architecture_Labs.md:2120`); LAB 61 "Rails and NIC placement" (`:2106`).

## 3. NVL72

- "responsible for the full-mesh connectivity between all 72 GPUs within the same DGX GB200 rack" (GB200 network-fabrics page above).
- A fault "in an NVSwitch tray, in the NVLink Subnet Manager, or in IMEX" can affect every job in the rack (`handbook/hardware-matrix.md:55`).
- IMEX check: `nvidia-imex-ctl -H -N` (`handbook/b300-nvl72-forum-triage-guide.md:313`); IMEX state (`handbook/command-reference.md:55`).
- NMX for NVL72 telemetry: only `plan/requirements-map.md:167` and `sources/2-networking.md:110`; no command in the handbook.

## 4. Hops and their checks

- GPUDirect RDMA: "enables a direct path for data exchange between the GPU and a third-party peer device using standard features of PCI Express"
  (<https://docs.nvidia.com/cuda/gpudirect-rdma/index.html>); runbook N5 "GPUDirect RDMA not in use" (`handbook/runbook-catalog.md:77`).
- PCIe bandwidth between a GPU and its NIC: NOT FOUND (the node view already says that the PCIe path is not in the sources).
- NVLink per direction: the NVL72 user guide counts 1.8 TB/s for each GPU in both directions (an existing derived fact); the tracer uses half of it in each direction for every NVLink 5 platform (`derived`).
- Commands (`handbook/command-reference.md`): `nvidia-smi topo -m` (:33); `nvidia-smi nvlink -e` (:37); `lspci -vv … LnkCap|LnkSta` (:35); `lspci -tv` (:36);
  `perfquery -x` (:73); `ibdiagnet` (:74); `mlxlink -d <device> -p <port>` (:75); `ethtool -S <nic>` (:79).
  Switch counters on Cumulus: `nv show interface <swp> counters` (`handbook/cli_utilities_layered_gist.md:134`).
- Vendor: mlxlink "is used to check and debug link status and related issues"; `-c` "Show Physical Counters and BER Info" (<https://networking-docs.nvidia.com/mftswum/4350/mlxlink-utility>).
- Labs: M3 lab "Run `ibstat`, `iblinkinfo`, `ibnetdiscover`, and `perfquery -x`" (`modules/m03-compute-fabric/README.md:45`); `ethtool -S` (`:48`);
  `ibtracert` path tracing (`handson/13-ibsim-real-fabric/README.md:84`).

## 5. Storage path (3-ii)

- GDS: "enables a direct data path for direct memory access (DMA) transfers between GPU memory and storage, which avoids a bounce buffer through the CPU";
  "Without GDS, an extra copy through a bounce buffer in the CPU is necessary"; it lists "VAST-NFS" (<https://docs.nvidia.com/gpudirect-storage/overview-guide/index.html>).
- Repository: GDS (`handbook/command-reference.md:101`); bounce buffer (`sources/3-storage.md:22`); VAST parts (`modules/m08-storage-and-data-path/README.md:19`); CNode and DNode (`sources/7-rafay-and-vast.md:210`); storage leaf (`handbook/command-reference.md:147`).
- BlueField-3 as the storage path: NOT FOUND in the repository.

## 6. Ingress and operator access (3-ii)

- Edge: firewall, 2 edge routers, 200G uplink; the control-plane VIP load balancer is open (`plan/requirements-map.md:31`).
- TLS offload and passthrough (`modules/m09-platform-kubernetes-rafay/README.md:22-23`); runbook P7 (`handbook/runbook-catalog.md:107`).
- User → Kubernetes ingress → pod: NOT FOUND.
- PAM and MFA (`handbook/security-operations.md:27`); the approved path (`:29`); break-glass (`:37`); ZTKA (`modules/m09-platform-kubernetes-rafay/README.md:20`).
- Rafay ZTKA: "No changes to firewall rules on remote clusters"; "The target k8s cluster can be deployed anywhere even behind a firewall" (<https://docs.rafay.co/accessproxy/architecture/>).
- Bastion, jump host, VPN: NOT FOUND.

## 7. Telemetry (3-ii)

- Sources and routes as in the m2c sourcing notes, section 4. NetQ → Prometheus: NOT FOUND (the overview link stays a label).

## 8. Control (3-ii)

- SM: "walking the fabric with SMPs (Subnet Management Packets)" (`handson/13-ibsim-real-fabric/ARCHITECTURE.md:59`); "fills in every switch's linear forwarding table" (`:63`); MADs (`:85`).
  A vendor quote for the SM MADs: NOT FOUND.
- NVLSM: "the NVLSM service is responsible for configuring NVSwitch routing tables, while FM handles GPU-side routing"
  (<https://docs.nvidia.com/datacenter/tesla/fabric-manager-user-guide/index.html>).
