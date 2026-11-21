# Onsite Procedures

**Use:** the physical work in the data hall, for the Onsite path of role-paths.md and for any engineer who works at the rack.
The procedures L9 to L14 of [runbook-catalog.md](runbook-catalog.md) use this page. Write each one in the runbook template during the first 90 days.

<!-- paths:start -->
**Role paths** (the levels: role-paths.md): L1 — · L2 Core · L3-C Core · L3-P — · Onsite Full.
- **L2 Core** (0.25 h). Read: "Rules that have no exception"; "Dispatch". Labs: —. Check: Write one dispatch for the onsite engineer.
- **L3-C Core** (0.25 h). Read: "Rules that have no exception"; "Dispatch". Labs: —. Check: Write one dispatch for the onsite engineer.
<!-- paths:end -->

The onsite engineer is the hands of the remote team.
The remote engineer decides what to change; the onsite engineer does it safely, confirms it, and records it.
The customer's facility team keeps the building: power, cooling, access, and the building management system (BMS).

## Rules that have no exception

1. **No facility work.** Do not do electrical, cooling, or building work. Ask the facility team for power isolation and for rack access. Send cooling and leak alarms to the facility team and the BMS engineer.
2. **Drain before you touch.** A node leaves production (procedure L1) before you open it, reseat a part, or disconnect a cable. The remote engineer confirms the drain.
3. **The OEM procedure is the procedure.** Replace a part only with the steps of the server's Installation and Service Manual, and only a part that the OEM permits you to replace.
4. **ESD protection for each part.** Ground yourself and the work surface; carry GPUs, memory, and NICs only in protective packaging (the principles of ANSI/ESD S20.20).
5. **Laser safety.** Never look into a transceiver or into the end of a connected optical cable.
6. **Record each physical change** (procedure L14). A change that is not in the port map, the rack layout, and the CMDB causes the next incident.

## Read (5 h)

| Source | Section | Hours |
|--------|---------|------:|
| Dell [PowerEdge XE9785 Installation and Service Manual](https://www.dell.com/support/manuals/en-us/poweredge-xe9785/xe9785_ism/poweredge-xe9785-system-overview) (or the manual of your model) | The indicator codes; the safety instructions; "before and after working inside your system"; the removal and installation of fans, power supplies, and PCIe cards | 2.0 |
| Dell [PowerEdge XE AI servers spec sheet](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-xe-ai-spec-sheet.pdf) | Your model: which parts are hot-swap and which are cold-swap | 0.25 |
| Dell, [Export a SupportAssist Collection using iDRAC or racadm](https://www.dell.com/support/kbdoc/en-us/000126308/export-a-supportassist-collection-via-idrac9) | All | 0.25 |
| Dell, [Update firmware from the Lifecycle Controller](https://www.dell.com/support/kbdoc/en-us/000128133/poweredge-server-lifecycle-controller-update) | All; the pinned repository from Dell Repository Manager | 0.5 |
| NVIDIA [Cable Management Guidelines and FAQ](https://networking-docs.nvidia.com/cablemanagfaq/frequently+asked+questions+(faq)) | Cleaning and inspection of optical connectors | 0.5 |
| NVIDIA [Networking Interconnect](https://networking-docs.nvidia.com/interconnect/index.html) | The 800G OSFP cables and transceivers of your fabric | 0.5 |
| ESD Association, [An Overview of ANSI/ESD S20.20](https://www.esda.org/news/an-overview-of-ansiesd-s20-20/) | All | 0.5 |
| NVIDIA [Q32xx and Q34xx XDR InfiniBand Switch Systems User Manual](https://networking-docs.nvidia.com/xdrswitcheshw/introduction) | Introduction: the switch parts that you can replace | 0.5 |

**Watch (optional, 6 min, not in the Must total):** ServeTheHome, [Inside a NEW AI Cluster - Tour with NVIDIA B200](https://www.youtube.com/watch?v=N5AJJ0tAoxc), from 5:50 to 11:50.
The server in the video is a Supermicro HGX B200, not a Dell server, but the parts are the same:
the GPU tray and the host tray,
the hot-swap fans and power supplies at the rear (8:13),
the NIC tray that you pull out from the rear (9:11),
and a weight of approximately 130 kg: never lift a server alone.
The NVL72 rack at 11:33 shows the switch trays and the power shelves.

## The procedures

### L9 — Physical check of a node or a rack

1. Find the node: the rack and the slot from the CMDB; turn on the system ID LED from iDRAC so that you touch the correct server.
2. Read the front and back indicators against the indicator codes of the Installation and Service Manual: system health, power supplies, fans, NICs, drives.
3. Compare with what iDRAC reports (the sensors and the system event log). Report both to the remote engineer.

### L10 — FRU replacement under the OEM procedure

1. Confirm the part and the evidence with the remote engineer (the diagnosis, the OEM case number).
2. Hot-swap or cold-swap: read it in the spec sheet of your model. On the air-cooled XE9780 and XE9785, the GPU fans are hot-swap and the CPU fans are cold-swap (the server must be off).
3. Drain (procedure L1); for a cold-swap part, the remote engineer powers the server off.
4. Replace the part with the steps of the Installation and Service Manual and the ESD rules.
5. Record the serial number of the removed part and of the new part (procedure L12).
6. The node goes to burn-in (procedure L1). It does not return to production without the tests.

### L11 — Optic and cable work

1. Find the port on both ends with the port map; confirm the link on the switch and on the node before you touch it.
2. Clean and inspect both the transceiver and the cable connector before each insertion. MPO connectors (OSFP, QSFP) and LC connectors (SFP) need different cleaning tools.
3. After the change: the link state, the error counters (`mlxlink`, `perfquery -x`; runbook N2), and the port map against `ibnetdiscover` (M3 lab step 5).

### L12 — RMA receiving and return

1. Receive the part: check the part number and the serial number against the OEM case; record it in the CMDB.
2. The evidence for the case (procedure L2): on Dell servers, export the SupportAssist collection with iDRAC or `racadm techsupreport`, and attach it by hand.
3. Return the defective part in its protective packaging; record the tracking number and the date for the RMA turnaround KPI (procedure L8).
4. Keep the spare pool count current (procedure L8).

### L13 — Work permit and the facility boundary

1. Ask the facility team for the work permit and the rack access before the work, with the rack, the time, and the risk.
2. For power isolation, a cooling alarm, a leak, or a smell of burning: stop, move away, and call the facility team. Do not fix it.
3. After the work: close the permit, and report to the remote engineer.

### L14 — As-built update after a physical change

1. Update the port map for each cable that moved.
2. Update the rack layout for each part or server that moved.
3. Update the CMDB record (serial numbers, location).
4. Tell the remote engineer, who runs the port-map validation (M3 lab step 5) again at the next change window.

## Dispatch

The remote engineer opens a dispatch in the ticket: the node or the rack, the evidence, the task (one of L9 to L14), the drain state, and the priority.
The onsite engineer acknowledges, confirms the drain, does the task, and closes the dispatch with the result and the records.
Outside business hours, dispatch is on-call; the arrival time is in the contract.

## Assess

Slack bot topic `Onsite` (assessment.md); checkpoint C1 and C2 (Onsite).
Lab checklist:
- [ ] The correct server is found with the system ID LED before any work.
- [ ] Both optical ends are cleaned and inspected before insertion.
- [ ] The hot-swap on spare hardware follows the manual, with the ESD rules.
- [ ] The serial numbers of the removed and the new part are recorded.
- [ ] The dispatch record is closed with the result, and the as-built records (L14) are updated.
