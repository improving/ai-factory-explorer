# L1 Primer: before your first shift

**Use:** the first part of the L1 path of role-paths.md, for an analyst who has Linux basics only.
Do it before M0 - The layer model and the method. After it, you can read the state of a node, a pod, and an alert, and you know which commands you may run.

<!-- paths:start -->
**Role paths** (the levels: role-paths.md): L1 Full · L2 — · L3-C — · L3-P — · Onsite —.
<!-- paths:end -->

The rest of this repository assumes Linux, Kubernetes, and Prometheus. This page gives the minimum of each for the NOC shift.

## The rule for L1

**Read, do not change.**
L1 reads dashboards, alerts, logs, and object states, opens the ticket, and runs the first 5 minutes of a runbook.
L1 does not restart, drain, reboot, delete, or edit anything, unless a runbook step says that L1 may do it.
When you are not sure, escalate. An early escalation is never a fault.

## Read (3.5 h)

| Source | Section | Hours |
|--------|---------|------:|
| DigitalOcean, [How to use journalctl to view and manipulate systemd logs](https://www.digitalocean.com/community/tutorials/how-to-use-journalctl-to-view-and-manipulate-systemd-logs) | Viewing logs; filtering by time, by unit, and by priority | 1.0 |
| man7.org, [systemctl(1)](https://man7.org/linux/man-pages/man1/systemctl.1.html) | The `status` command: active, inactive, failed | 0.25 |
| Kubernetes, [Viewing Pods and Nodes](https://kubernetes.io/docs/tutorials/kubernetes-basics/explore/explore-intro/) | All (an interactive tutorial) | 1.0 |
| Kubernetes, [kubectl Quick Reference](https://kubernetes.io/docs/reference/kubectl/quick-reference/) | "Viewing and finding resources"; "Interacting with running Pods" | 0.5 |
| Prometheus, [Alerting overview](https://prometheus.io/docs/alerting/latest/overview/) | All | 0.5 |
| Grafana, [Dashboards](https://grafana.com/docs/grafana/latest/visualizations/dashboards/) | The overview: dashboards, panels, time range | 0.25 |

## The words

| Word | Meaning on this cluster |
|------|-------------------------|
| Node | One GPU server (8 GPUs) or one control-plane server. Kubernetes shows it as a `Node` object. |
| Pod | One or more containers that run together on one node. A customer job is one or more pods. |
| `Ready`, `NotReady` | The Kubernetes state of a node. `NotReady` means that the node does not report to the control plane. |
| Taint, cordon, drain | Marks that stop new pods on a node (taint, cordon), and the removal of the running pods (drain). L2 does these. |
| Tenant | One customer or one internal team, with its own organization in Rafay. The NOC tenant is your home. |
| Alert | A rule in Prometheus that is true for a time. Alertmanager groups alerts and sends them to people and tools. |
| Xid | An error number that the NVIDIA driver writes in the kernel log. The number tells the class of the GPU fault. |
| Ticket | The record of an incident or a request in the customer's ticket tool. One incident has one ticket, not one ticket for each alert. |

## The commands that L1 may run

All are read-only. Run them only where your access allows.

| Question | Command |
|----------|---------|
| Which nodes are not ready? | `kubectl get nodes` |
| Why is this node not ready? | `kubectl describe node <node>` (read "Conditions" and "Events") |
| What happened recently in a namespace? | `kubectl get events -n <namespace> --sort-by=.lastTimestamp` |
| Which pods are not running? | `kubectl get pods -A --field-selector=status.phase!=Running` |
| Is a service up on a host? | `systemctl status <service>` |
| What did a service log in the last hour? | `journalctl -u <service> --since "1 hour ago"` |
| Is there a GPU error in the kernel log? | `journalctl -k --since "1 hour ago" \| grep -i xid` |
| Is the clock of a node correct? | `chronyc tracking` |

Take the output into the ticket as text, not as a screenshot.

## Lab (T0: a laptop with `kind` and Mokka; 2 h)

1. In a `kind` cluster, stop the kubelet of one worker node. Find the node with `kubectl get nodes`, and write what `kubectl describe node` says.
2. With Mokka, inject a GPU fault. Find the Xid in the kernel log that the mentor gives you, and name the runbook in [runbook-catalog.md](runbook-catalog.md).
3. Open a Grafana dashboard that the mentor gives you. For 3 panels, say what is normal and what is not.
4. From one firing alert, write the ticket with the fields of [shift-discipline.md](shift-discipline.md).

**Hands-on (T0, optional):** [H02](../handson/02-runtime-control/README.md) (inject a GPU fault; step 5 puts the Xid line in the kernel log); [H03](../handson/03-troubleshooting/README.md) (Drill 7: classify Xid codes).

**Self-check:** a node is `NotReady` and the GPU dashboard shows no data for it. Which 3 facts do you put in the ticket, and to whom do you escalate?

## Assess

Slack bot topic `L1-primer` (assessment.md); checkpoint C0 and C1 (L1).
Lab checklist:
- [ ] `kubectl describe node` output is read, and the node condition is named.
- [ ] The Xid of the mentor's log extract is found, with its runbook.
- [ ] For 3 dashboard panels, you say what is normal and what is not.
- [ ] The ticket from the alert has all the fields of the shift discipline.
