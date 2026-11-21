# Shift Discipline

**Use:** how the operations team runs a shift: the priority, the clocks, the ticket, the escalation, the updates, the handover, the daily health check, and the problem record.
L1 and L2 use all of it; L3 uses the escalation and the problem record. See role-paths.md.
The source is the managed-service RFP; see requirements-map.md, sections 4 and 6.

<!-- paths:start -->
**Role paths** (the levels: role-paths.md): L1 Full · L2 Full · L3-C Core · L3-P Core · Onsite Core.
- **L3-C Core** (0.25 h). Read: Sections 4 (escalation) and 8 (problem record). Labs: Lab step 5. Check: One problem record with its known error entry.
- **L3-P Core** (0.25 h). Read: Sections 4 (escalation) and 8 (problem record). Labs: Lab step 5. Check: One problem record with its known error entry.
- **Onsite Core** (0.25 h). Read: Sections 3 (ticket), 4 (escalation), and 6 (handover). Labs: Lab step 3. Check: One shift handover.
<!-- paths:end -->

## Read (2 h)

| Source | Section | Hours |
|--------|---------|------:|
| ServiceNow, [Managing incident priority](https://www.servicenow.com/community/itsm-blog/managing-incident-priority/ba-p/2294101) | The impact and urgency table | 0.5 |
| UC Berkeley IT, [Incident impact, urgency, and priority guide](https://berkeley.service-now.com/kb_view.do?sysparm_article=KB0010891) | The impact table, the urgency table, the priority matrix: an example of a live ServiceNow setup | 0.5 |
| PagerDuty, [Severity levels](https://response.pagerduty.com/before/severity_levels/) | All | 0.5 |
| PagerDuty, [Being on-call](https://response.pagerduty.com/oncall/being_oncall/) | The end of a shift: the handoff | 0.5 |

## 1. The priority

The priority comes from the business impact and the affected GPU capacity.
If you are not sure between two priorities, select the higher one; you can lower it later.

| Priority | Example condition | Acknowledge | Technical engagement | Update | Restore or workaround |
|----------|-------------------|------------:|---------------------:|--------|-----------------------|
| P1 Critical | Material cluster outage; control-plane failure; major fabric event; large loss of GPU capacity; critical security event | ≤ 10 min | ≤ 15 min | each 30 min | ≤ 4 h |
| P2 High | Significant degraded capacity or redundancy; many nodes or racks; material platform degradation | ≤ 15 min | ≤ 30 min | each hour | ≤ 8 h |
| P3 Medium | Limited impact; one node or component with a capacity workaround; non-critical service degradation | ≤ 30 min | ≤ 2 h | as agreed | ≤ 2 business days |
| P4 Low | Routine requests, information, standard tasks | ≤ 4 business hours | planned | as agreed | agreed target |

The ticket tool can calculate the priority from impact and urgency.
On this cluster, impact = how many GPUs and tenants are affected; urgency = how fast it gets worse.
Agree with the customer which "large loss of GPU capacity" and "many nodes" numbers make a P1 and a P2, and write them here: **[input]**.

## 2. The clocks

The clocks start when the alert fires or when the user reports, not when you see it.
Record in the ticket: the time of acknowledge, of technical engagement (an engineer works on it), of each update, and of restore.
The SLA measures the ticket times and the restore of usable GPU capacity.

## 3. The ticket

The customer's ticket tool has no integration with the monitoring at this stage: you open the ticket by hand.
One incident has one ticket. Link the alerts to it; do not open one ticket for each alert.

| Field | Content |
|-------|---------|
| Title | The symptom, not the cause: "4 nodes NotReady in rack 12", not "switch fault" |
| Configuration item | The node, switch, or service, with its name in the CMDB |
| Tenants and GPUs affected | The tenant names and the GPU count |
| Impact, urgency, priority | From section 1 |
| First seen | The time the alert fired or the user reported |
| Evidence | The alert, the command outputs as text, the dashboard link |
| Runbook | The runbook and the step that you ran |
| Escalation | To whom, and when |

## 4. The escalation

| From | To | When |
|------|----|------|
| L1 | L2 | At the end of the first 5 minutes of the runbook with no fix; at once for P1 and P2 |
| L2 | L3 | When the runbook ends with no fix, when a change beyond a standard change is necessary; at once for P1 |
| L3 | L4 (the OEM or the platform vendor) | A product defect, a firmware defect, an RMA. We keep the case until it is closed. |
| Any | The major-incident commander | Each P1 and P2 |
| Any | The facility team | Power, cooling, leak, access, a work permit (procedure L13) |
| Any | The enterprise network team | DNS, NTP, IPAM, the firewall, upstream routing (runbook N10) |
| Any | The security team | A suspected security event ([security-operations.md](security-operations.md)) |

One owner: do not close or reassign an incident because the fault is with a supplier. We own it until it is closed.

## 5. The stakeholder update

At the cadence of the priority. Each update says:
what happened, the impact (tenants and GPUs), what we do now, what the customer can do, and the time of the next update.
Use the "Customer message" section of the runbook.

## 6. The shift handover (procedure L6)

At the end of each shift, give the next shift, in writing and by voice:
- the open P1, P2, and P3 incidents, with the next action and its owner;
- the degraded capacity: the GPUs and nodes in the degraded, quarantined, and awaiting-RMA states;
- the active and planned changes;
- the open vendor cases, with their age;
- the watch items: anything that is not an incident but can become one.

## 7. The daily health check (procedure L17)

Each day during hypercare, and each week after it. From the capacity view of M10 and the ticket tool:
1. The GPUs in each state (available, allocated, degraded, quarantined, in maintenance, awaiting RMA), and the change since yesterday.
2. The GPU hours lost since yesterday, and why.
3. The open incidents, and the defects from the transition.
4. The planned work of today, and its capacity effect.
5. The vendor cases and their age.
6. The backups: the last completed backup of each management plane (procedure L15).
7. The 5 noisiest alerts: tune them or write a ticket for them.
8. The risks.

## 8. The problem record (procedure L18; L2 and L3)

Open a problem record for each P1, for a root-cause class that comes back inside 30 days, and for a trend (for example the same link that flaps each week).
The record has: the symptom; the linked incidents; the root cause, when it is known; the workaround; the known error entry in the Known Error Database, so that the next engineer finds the workaround; the permanent fix, with its owner and its date; the closure check (no repeat for an agreed time).
The weekly service review reads the open problem records (procedure L6).

## Lab (No-HW, 2 h)

1. Assign the priority to 10 scenario tickets from the mentor, and start the clocks.
2. Write the 30-minute updates for one P1 from the game day of M7.
3. Run one shift handover from a filled board.
4. Run one daily health check from the capacity view of the M10 lab.
5. L2 and L3: write one problem record and its known error entry from one game-day postmortem.

## Assess

Slack bot topic `Shift` (assessment.md); checkpoint C1 and C2 (L1, L2).
Lab checklist:
- [ ] At least 9 of the 10 scenario tickets have the correct priority.
- [ ] Each 30-minute update has the impact, the action, and the time of the next update.
- [ ] The handover has the 5 items of section 6.
- [ ] The daily health check has the 8 items of section 7.
- [ ] L2 and L3: the problem record has a known error entry and a permanent fix with an owner.
