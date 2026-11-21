# AI Factory Explorer, milestone 4: sourcing notes (failure simulator)

**Use:** the facts that the failure rules of `src/catalog/failures.ts` cite (spec section 7).
Each repository line was checked with `grep -n` or `sed`; the vendor quote was checked against the raw page on 2026-10-14.
Abbreviations: RC = `handbook/runbook-catalog.md`, CR = `handbook/command-reference.md`, SD = `handbook/shift-discipline.md`, HM = `handbook/hardware-matrix.md`.

## 1. What the repository gives, and what it does not

Many rules of spec section 7.2 appear only in the spec.
The simulator marks those rules `assumed`, with the closest repository line as the source:

- Fabric Manager down → the 8 GPUs of the node lose NVLink: only the question "Fabric Manager stops on one server. How many GPUs lose NVLink" (`modules/m01-accelerator-hardware/README.md:70`) and the scale-up failure domain "1 server, 8 GPUs" (HM:23).
- A leaf down: "rail k lost" and "half bandwidth": NOT FOUND in the repository; "the failure of one leaf switch does not isolate a node" in a dual-plane design (`modules/m03-compute-fabric/README.md:18`); the vendor quote for half bandwidth is in the m3 sourcing notes, section 1 (B300 Spectrum-X RA).
- CDU down → throttling, then shutdown: NOT FOUND as a chain; F1 (RC:152) and F3 "Emergency thermal shutdown of a rack or a row: the drain sequence" (RC:154).
- Both UFM units down: NOT FOUND for UFM; the OpenSM lab: "An SM outage does not corrupt existing tables, but it does freeze them" (`handson/13-ibsim-real-fabric/lab17/README.md:78`).
- Device plugin and driver blast radius; NIC blast radius; PSU blast radius; storage leaf down: NOT FOUND.
- Alert names: NOT FOUND (no rule files); the signals are in `modules/m05-observability-and-slos/README.md:75` and `:93`.
- Severity thresholds: an open customer input (SD:37; `plan/requirements-map.md:127`). No mapping from an affected percentage to a priority.

## 2. Rules with a source

- GPU Xid 79: G1 (RC:39); "make you drain the node immediately (79)" (`modules/m02-gpu-health-and-errors/README.md:46`); `dmesg -T | grep -i xid` (CR:21).
- GPU Xid 48: G2 (RC:40); `nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE` (CR:32); "if persistent, RMA candidate" (`handbook/b300-nvl72-forum-triage-guide.md:238`).
- NVSwitch: G3 (RC:41); `nvidia-smi nvlink -s` (CR:34); HGX failure domain "1 server, 8 GPUs" (HM:23); NVL72 "A fault in an NVSwitch tray … can affect every job in the rack" and "Drain decisions … must use the NVLink domain, not the node" (HM:55).
- Fabric Manager, NVLSM, IMEX: G7 (RC:45); `systemctl status nvidia-fabricmanager` (CR:56); "drain first" (CR:162); IMEX "Up to 1 rack, 72 GPUs" (HM:23); `nvidia-imex-ctl` (CR:55).
- Device plugin: P1 (RC:101); "A pod is `Running` but has no GPU" (CR:117). Driver: G10 (RC:48), P2 (RC:102); the driver pod crash loop (CR:118).
- NIC: no runbook; the game day maps "one rail disabled" to N2 (`modules/m07-incident-operations/README.md:104`); `ibstat` "A node lost the fabric; a port is down" (CR:70).
- Cable down: N1 (RC:73); `iblinkinfo` (CR:71). Cable degraded: N2 (RC:74); `perfquery -x` (CR:73); "one cable with a high error rate slows all jobs that cross it" (`modules/m03-compute-fabric/README.md:7`); onsite L11 (RC:170).
- Leaf and spine: N9 "Switch failure or switch upgrade: blast radius and drain plan" (RC:81); spine: "losing one spine … degrades bandwidth but does **not** partition anything" (`handson/13-ibsim-real-fabric/lab16/README.md:12`).
- UFM: N7 (RC:79); `ufm_ha_cluster status` (CR:146); the alert "a change of the active UFM unit" (`modules/m05-observability-and-slos/README.md:93`);
  vendor: "UFM HA should be configured on two appliances, master and standby"; the commands "failover" and "takeover" (<https://networking-docs.nvidia.com/ufmxdrenterpriseappsw/251/high-availability>).
- PSU: "each PSU is present and redundant" (`handbook/cluster-onboarding.md:123`); the alert "a failed power supply" (m05:93). BMC: G9 (RC:47); `ipmitool sel list` (CR:41).
- CDU: F1 (RC:152), F3 (RC:154); the game day "a CDU failure that affects 4 racks. Decide what to drain" (m07:85). PDU or power shelf: F2 (RC:153).
- VAST CNode: V2 "Client I/O stops or is slow after a CNode failure" with "VIP movement between CNodes" (RC:132); the first VAST command (CR:106).
- Rafay controller: R7 (RC:122); "the Rafay console does not open, but all clusters still run jobs" (`modules/m09-platform-kubernetes-rafay/README.md:107`).
  LB and VIP: P7 "… but the nodes run" (RC:107). Firewall: R1 "Cluster shows \"not reachable\" in Rafay" (RC:116). DNS and NTP: N10 (RC:82); `chronyc tracking` (CR:144).

## 3. Who acts, severity, incidents, drain

- L1 "does not restart, drain, reboot, delete, or edit anything" (`handbook/l1-primer.md:16`); escalation (SD:65-71): facility for "Power, cooling, leak, access" (SD:69); the network team for "DNS, NTP, IPAM, the firewall" (SD:70).
- Severity P1 to P4 (SD:30-33): P1 "large loss of GPU capacity"; P2 "Significant degraded capacity or redundancy; many nodes or racks"; P3 "one node or component with a capacity workaround"; P4 routine. The thresholds are an input (SD:37).
- Incidents: "One incident has one ticket. Link the alerts to it" (SD:48); "The routing layer decides which alerts belong to one incident" (m05:47); topology-aware correlation is open (`plan/requirements-map.md:119`).
- Drain: `kubectl cordon`, `kubectl drain` (CR:158); "on NVL72, one drain can stop a 72-GPU job" (CR:158); `scontrol update … State=DRAIN` (CR:160); L1 node drain procedure (RC:160).
- Lost GPU hours "= GPUs affected × hours outside service, for each incident" (`plan/requirements-map.md:204`); "keep the largest usable pool" (`plan/requirements-map.md:129`).

## 4. Scenario library

FM stops on one server (m01:70; m07:83); one link in 10 000 with a high symbol error rate (m03:77); the UFM master failed over at night (m03:78);
a spine goes down (lab16:47); the Rafay console is down but the jobs run (m09:107); a pod is Running but has no GPU (m09:106);
a 512-GPU all-reduce at 40 % of the expected bus bandwidth (`modules/m04-collectives-nccl/README.md:37`); a partly degraded cluster (`plan/requirements-map.md:263`).
A leaf down, single against dual plane: no drill in the repository (m03:18 is the closest line).
