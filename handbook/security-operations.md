# Security Operations for Infrastructure Engineers

**Use:** the security part of the daily work on the cluster: access, break-glass, a suspected security event, and the patch flow.
**Status:** a proposal for decision 2 of requirements-map.md, section 12. The customer's security team owns the security policy; this page is how the operations team follows it.
The RFP (sections 4.10, 11, and 12) puts these tasks on the managed-service team.

<!-- paths:start -->
**Role paths** (the levels: role-paths.md): L1 Core · L2 Core · L3-C Full · L3-P Full · Onsite Core.
- **L1 Core** (0.75 h). Read: The CISA and Microsoft rows; the access rules; L19; L20. Labs: Lab steps 1 and 2. Check: The two tabletops.
- **L2 Core** (2.25 h). Read: The L1 part, and the CISA Known Exploited Vulnerabilities and NIST SP 800-40 rows; the patch flow. Labs: Lab steps 1 to 3. Check: The advisory decision of lab step 3.
- **Onsite Core** (0.75 h). Read: The CISA and Microsoft rows; the access rules; L19; L20. Labs: Lab steps 1 and 2. Check: The two tabletops.
<!-- paths:end -->

## Read (3.75 h)

| Source | Section | Paths | Hours |
|--------|---------|-------|------:|
| CISA, [Cross-Sector Cybersecurity Performance Goals](https://www.cisa.gov/cross-sector-cybersecurity-performance-goals-cpgs) | Goal 2.E, separating user and privileged accounts | All | 0.25 |
| Microsoft, [Manage emergency access admin accounts](https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/security-emergency-access) | Why two accounts; the exclusions; monitoring each use. The method applies to any identity provider. | All | 0.5 |
| CISA, [Known Exploited Vulnerabilities Catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) | The catalog; how to use it | L2, L3 | 0.5 |
| NIST, [SP 800-40 Rev. 4, Guide to Enterprise Patch Management Planning](https://csrc.nist.gov/pubs/sp/800/40/r4/final) | The summary; maintenance groups; normal and emergency patching | L2, L3 | 1.0 |
| NIST, [SP 800-61 Rev. 3, Incident Response Recommendations](https://csrc.nist.gov/pubs/sp/800/61/r3/final) | The Respond function | L3 | 1.5 |

## The access rules (all paths)

1. **Named accounts only.** No shared account, on any system.
2. **A separate privileged account.** Use the privileged account only for the task that needs it, through the customer's PAM and MFA.
3. **Least privilege.** Ask for the access that the task needs, for the time that it needs.
4. **The approved path only.** All support access goes through the connectivity that the customer approves. No direct Internet exposure of a tool, and no remote-access tool of your own.
5. **No data leaves the boundary.** Do not copy production data, logs, or telemetry outside the approved boundary without the customer's written authorization. This includes the evidence for an OEM case: send only what the case needs, through the approved channel.
6. **The audit log is evidence.** Do not change or delete it. Rafay audit logs are read-only for users, and they go to the SIEM.

## L19 — Break-glass access

**When:** the normal access path (the identity provider, the PAM, or the SSO of Rafay) does not work during a P1, and the restore needs privileged access.
1. The customer approves each use. Record the approver and the time in the ticket.
2. The break-glass accounts: a minimum of two, kept offline, with no dependency on the system that failed.
3. Each use is logged and reviewed after the incident.
4. Change the credentials after each use.
5. Test the procedure on a schedule, in a continuity exercise (M7 game day, readiness and continuity faults).

## L20 — A suspected security event

**Examples:** an unknown process on a node, an unknown account, a change in the audit log that nobody made, a configuration change with no change record.
1. Report it to the customer's security team at once. A critical security event is a P1.
2. Do not power off, reboot, reimage, or wipe the node until the security team agrees. These actions destroy evidence.
3. Isolate the node only when the security team asks, and in the way that it asks (for example, by the network).
4. Preserve the evidence: the logs, an export of the audit log, the commands that you ran, and the times. Record each item in the ticket.
5. Discuss the event only in the incident channel.

## The vulnerability and patch flow (L2, L3)

1. **Sources:** the security bulletins of the suppliers (NVIDIA, Dell, Rafay, VAST, the switch operating system), and the CISA Known Exploited Vulnerabilities catalog as the signal for urgency.
2. **Review:** the vendor advisory review (procedure L21, M10) decides the action for each advisory: patch now, patch in the next window, or accept with a reason.
3. **Change:** a patch is a change (procedure L7). It goes through the compatibility matrix and a canary group. An urgent patch is an emergency change, not a change without a record.
4. **Compliance:** patch and firmware compliance against the approved baseline is an RFP KPI (M10).

## Hardening (L3)

The customer's hardening standard is the baseline: **[input]**.
The parts that the operations team owns: the BMC (iDRAC) accounts and their network, the management access of the switches and the UFM units, the certificates of the Rafay Controller, the SSH access to the nodes.

## Lab (No-HW, 1 h)

1. Tabletop: during a P1, the identity provider is down. Run L19 with a mentor as the customer approver.
2. Tabletop: a node shows an unknown process with outbound connections. Run L20: who do you call, what do you not do, and what do you keep?
3. L2 and L3: take one advisory from the Known Exploited Vulnerabilities catalog that affects a Linux package on the nodes, and write the decision of procedure L21.

## Assess

Slack bot topic `Security` (assessment.md); checkpoint C2.
Lab checklist:
- [ ] In the break-glass tabletop, the approval is recorded before the access, and the credential change after it.
- [ ] In the security-event tabletop, the node is not rebooted or wiped, and the evidence list is complete.
- [ ] L2 and L3: the advisory decision has a reason and a change record.
