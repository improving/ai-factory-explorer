# Runbook Catalogue

**M7 - Incident operations, lab 1:** review and extend one written runbook (see [Written runbooks](#written-runbooks)), write 2 runbooks from rows that have no runbook yet (one node or fabric runbook), and review 3 from another trainee. The Rafay and VAST runbooks are written in the labs of M8 and M9.
The team writes the rest in the first 90 days. 57 runbooks and 22 lifecycle procedures in total.

## Write these five first

Ranked by how often the class causes an interruption at scale.
The numbers are the unexpected interruptions of the Llama 3 405B training (419 in 54 days on approximately 16 000 GPUs; source: *The Llama 3 Herd of Models*, section 3.3.4).

| Rank | Runbook | Share of interruptions | Why first | Written |
|-----:|---------|-----------------------:|-----------|---------|
| 1 | G1, G2 — GPU off the bus, GPU memory errors | 58.7 % (GPU 30.1 %, HBM 17.2 %, other GPU 11.4 %) | The largest class by far. | [RB-03](../runbooks/RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md) |
| 2 | N4 — NCCL timeout or hang | in "software bugs", 12.9 % | The most frequent customer-visible symptom of every other class. | [RB-02](../runbooks/RB-02-nccl-init-hang-slow-transport.md) |
| 3 | N2 — cable or transceiver fault | in "network", 8.4 % | The most frequent fabric fault; it slows jobs before it fails them. | [RB-04](../runbooks/RB-04-ib-roce-link-switch-ufm.md) |
| 4 | P4, R1 — node `NotReady`, cluster not reachable in Rafay | in "host maintenance", 7.6 % | The platform-side view of a node loss. | [RB-08](../runbooks/RB-08-platform-scheduling-slurm-k8s-bcm-power.md) |
| 5 | V1, S1 — slow storage client, checkpoint stall | not separated in the Llama 3 table | Every restart of rank 1 to 4 goes through a checkpoint. | [RB-07](../runbooks/RB-07-storage-checkpoint-slow-stuck.md) |

## Runbook template

Each runbook has these 11 sections, in this sequence:

1. **Trigger:** the alert name or the customer symptom.
2. **Impact and blast radius:** one job, one node, one rack, one scalable unit, or the fabric.
3. **First 5 minutes:** the commands to run and the dashboards to open, with the expected output. Take them from [command-reference.md](command-reference.md).
4. **Hardware variants:** what is different on each hardware type in the fleet (the command, the log signal, the threshold). See [hardware-matrix.md](hardware-matrix.md).
5. **Decision table:** the observation, the conclusion, and the next action.
6. **Mitigation:** the fastest safe action that stops the customer impact.
7. **Repair:** the full correction, with the remediation ladder (retry, restart, GPU reset, reboot, drain, RMA).
8. **Evidence to collect:** the logs and the reports that the supplier needs.
9. **Return to service:** the tests that the node or the component must pass.
10. **Escalation:** who to call, and when.
11. **Customer message:** a template text.

## Review checklist

Use this checklist to review a runbook (M7 lab 1, checkpoint C2 of assessment.md, and each change to a written runbook).
A runbook passes when each line is true.

- [ ] It has the 11 sections of the template, in sequence.
- [ ] The trigger names the alert or the symptom text that a person sees, not only the cause.
- [ ] The first 5 minutes have at most 3 commands, each with the output that you expect.
- [ ] The first 5 minutes say which steps L1 may run; L1 steps are read-only ([l1-primer.md](l1-primer.md)).
- [ ] The impact section gives the blast radius and the priority P1 to P4 of [shift-discipline.md](shift-discipline.md).
- [ ] The hardware variants use the rows of [hardware-matrix.md](hardware-matrix.md), and say "to be confirmed" where no source gives the signal.
- [ ] Each row of the decision table has an observation, a conclusion, and a next step that exists in the runbook.
- [ ] Each action that changes the system gives the level (L2 or L3), the gate before it (drain, ComputeDomain check, change window, job owner), the impact, and an undo that really undoes it.
- [ ] Each command exists, with these flags, in [command-reference.md](command-reference.md), the [CLI gist](cli_utilities_layered_gist.md), or the vendor documentation.
- [ ] The evidence is what the supplier asks for (procedure L2), and it is collected before the repair changes it.
- [ ] The return to service has tests with a pass value, and uses the shared drain and return-to-service procedure.
- [ ] The escalation names the next level and the supplier, and when to call them.
- [ ] The customer message promises nothing that is not verified, and gives the next update time of the priority.
- [ ] No customer name, site name, or address is in the text.

## Written runbooks

Twelve runbooks are written, in [runbooks/](../runbooks/README.md): the debug set RB-01 to RB-09, RB-10 for facility emergencies, and RB-11 and RB-12 for the platform lifecycle.
RB-01 to RB-09 come from the [B300/NVL72 forum triage guide](b300-nvl72-forum-triage-guide.md) and the [CLI gist](cli_utilities_layered_gist.md).
Each one has the 11 sections of the template above, and two appendices: the gaps and open questions, and the source trace.
One runbook can cover more than one row of the tables below.
The rows that no runbook covers are for the trainees (M7 lab 1, the labs of M8 and M9) and for the team in the first 90 days.

| Written runbook | Covers catalogue rows | Notes |
|---|---|---|
| [RB-01](../runbooks/RB-01-nvlink-fabric-fm-imex.md) | G3, G7 | NVLink and NVSwitch Xids (74, 149, 137); Fabric Manager, NVLSM, and IMEX health, also through the ComputeDomain on Kubernetes |
| [RB-02](../runbooks/RB-02-nccl-init-hang-slow-transport.md) | N3, N4, N5 | NCCL init hang, timeout, wrong or slow transport, mid-run hang; the GPUDirect RDMA, peermem, IOMMU, and ACS checks of N5 |
| [RB-03](../runbooks/RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md) | G1, G2, G5, G6, G8 | ECC, Xid, row remap, thermal, power, and silent wrong results; the proof that an application-caused Xid follows the job |
| [RB-04](../runbooks/RB-04-ib-roce-link-switch-ufm.md) | N1, N2, N6, N7, N9 | Link flap, bit errors, cable and transceiver, RoCE congestion, UFM and subnet manager failover, the switch drain plan; the hand-off to the onsite procedures L11 and L14 |
| [RB-05](../runbooks/RB-05-firmware-driver-bmc-bios-dkms-doca.md) | G4, G9, G10 | Driver, DKMS, DOCA-OFED, and firmware regressions and version alignment; the GSP Xids; the BMC and BIOS path; GDS P2PDMA |
| [RB-06](../runbooks/RB-06-bluefield-dpu-boot-mlx5-eswitch.md) | none yet | BlueField DPU boot, mlx5 firmware initialization, eSwitch, OVS, and HBN data path; a candidate new row (DPU data path) |
| [RB-07](../runbooks/RB-07-storage-checkpoint-slow-stuck.md) | S1, S2, S4, S5, V1, V2, V4 | Checkpoint slow or stuck, dataloader stall, local NVMe, the VAST client, CNode, VMS, and CSI paths |
| [RB-08](../runbooks/RB-08-platform-scheduling-slurm-k8s-bcm-power.md) | P1, P2, P4, P7, R1, R2, N10; the PSU and DPS policy part of F2 | Slurm and Kubernetes scheduling, Rafay reachability and blueprints, time sync, BCM queues, DPS power policy; owns the shared drain and return-to-service procedure (L1) |
| [RB-09](../runbooks/RB-09-cuda-toolchain-dcgm-false-positive.md) | none | Stop and confirm: CUDA toolchain errors and DCGM health warnings that look like a hardware fault |
| [RB-10](../runbooks/RB-10-facility-cooling-power-emergency.md) | F1, F3; the PDU and power shelf part of F2 | CDU and coolant loop alarms, rack power events, and the drain sequence before an emergency thermal shutdown |
| [RB-11](../runbooks/RB-11-job-pending-queue-gang-topology.md) | P3 | A pending job: the queue quota and limit, the gang, the topology level, and the node eligibility; KAI Scheduler and NVIDIA Run:ai, with the Slurm equivalent |
| [RB-12](../runbooks/RB-12-host-not-allocatable-lifecycle.md) | P9, P10 | A host that cannot be allocated: the lifecycle state, the health classification, the SKU, the firmware baseline, and the network cleanup gate |

## GPU and node

| # | Runbook | Primary signals |
|---|---------|-----------------|
| G1 | GPU fell off the bus (Xid 79) | kernel log, `nvidia-smi` cannot find the GPU, PCIe AER events |
| G2 | GPU memory errors: double-bit ECC (Xid 48), row remap event and failure (Xid 63, 64), contained and uncontained errors (Xid 94, 95), unrecovered ECC (Xid 140) | DCGM ECC fields, `nvidia-smi -q -d ROW_REMAPPER` |
| G3 | NVLink error or NVSwitch fault (Xid 74, 149) | DCGM NVLink counters, `nvidia-smi nvlink`, Fabric Manager log |
| G4 | GSP timeout or GSP error (Xid 119, 120), context switch timeout (Xid 109) | kernel log, driver version against the compatibility matrix |
| G5 | Application-caused Xid (Xid 13, 31, 43): how to prove that the workload is the cause | the Xid class, the fault repeats on a different node with the same job |
| G6 | Thermal or power throttle | DCGM clock throttle reasons, inlet and coolant temperature, CDU telemetry |
| G7 | Fabric Manager, NVLink Subnet Manager (NVLSM, on HGX B200 and B300), or IMEX service failure (on Kubernetes: the ComputeDomain DaemonSet and the IMEX daemon of the node) | service state, NVLink domain state, CUDA initialization errors, the ComputeDomain node label, a pod stuck in `ContainerCreating` |
| G8 | Slow GPU with no error (suspected silent defect or silent data corruption) | per-rank step time, DCGM diagnostics level 4, a compare run on a known-good node |
| G9 | Node does not boot, or BMC is not reachable | Redfish or IPMI event log, the provisioning tool log |
| G10 | Driver, CUDA, or firmware mismatch after an upgrade | version inventory, GPU Operator pod state |

### GPU and node runbooks on AMD Instinct

Use this table for the "Hardware variants" section of G1 to G10.
The AMD signals are from the pages in sources/6-amd-and-hardware-generations.md.
"To be confirmed" means that no public page gave the signal; find it on real AMD hardware or ask AMD.

| # | NVIDIA signal | AMD Instinct signal |
|---|---------------|---------------------|
| G1 | Xid 79; `nvidia-smi` cannot find the GPU | PCIe AER events in the kernel log; the GPU is not in `amd-smi list`. The `amdgpu` message text: to be confirmed. |
| G2 | Xid 48, 63, 64, 94, 95, 140; the row remapper state | RAS counters `ue` and `ce` in `/sys/class/drm/card[N]/device/ras/`; `amd-smi metric --ecc`; `amd-smi bad-pages`; `gpu_vram_bad_pages` |
| G3 | Xid 74, 149; DCGM NVLink counters | `amd-smi xgmi` and `amd-smi topology` for the Infinity Fabric links. The error counters: to be confirmed. |
| G4 | Xid 119, 120, 109 | GPU reset and firmware messages from the `amdgpu` driver; `amd-smi firmware`. The message text: to be confirmed. |
| G5 | Xid 13, 31, 43 (application-caused) | To be confirmed. No public catalogue maps `amdgpu` messages to application faults. |
| G6 | DCGM clock throttle reasons | `amd-smi metric` (power, temperature, clocks); AMD Device Metrics Exporter |
| G7 | Fabric Manager or IMEX service state | Not applicable in the pages that opened: no separate fabric service was found for an 8-GPU Instinct server. To be confirmed. |
| G8 | DCGM diagnostics level 4; a compare run | ROCm Validation Suite; `rccl-tests` compare run on a known-good node |
| G9 | Redfish or IPMI event log | The same (the BMC is from the server supplier) |
| G10 | Driver, CUDA, and Fabric Manager versions; GPU Operator pod state | The ROCm compatibility matrix; `amd-smi version`; AMD GPU Operator pod state |

## Compute fabric

| # | Runbook | Primary signals |
|---|---------|-----------------|
| N1 | Link flap or link down on a compute rail | subnet manager or switch log, `iblinkinfo`, link downed counter |
| N2 | High bit error rate, symbol errors, defective cable or transceiver | `perfquery -x`, `mlxlink`, optical power and temperature |
| N3 | NCCL bandwidth below the threshold: find the defective node or link | `nccl-tests` bisection search, `NCCL_DEBUG=INFO` transport selection |
| N4 | NCCL timeout or hang | Flight Recorder dump, `py-spy`, NCCL RAS, per-rank logs |
| N5 | GPUDirect RDMA not in use (traffic goes through host memory) | `NCCL_DEBUG` output, `nvidia-peermem` or DMA-BUF state, ACS and IOMMU settings |
| N6 | RoCE congestion: PFC storm, ECN marks, packet drops | PFC pause counters, ECN counters, switch buffer telemetry |
| N7 | Subnet manager failover or routing problem (InfiniBand) | UFM events, the UFM HA state (which unit is active), subnet manager log, routing state |
| N8 | Tenant isolation fault (PKey or VLAN/VRF configuration) | partition configuration, reachability tests |
| N9 | Switch failure or switch upgrade: blast radius and drain plan | topology map, the affected nodes list |
| N10 | Time sync (NTP) or DNS fault on cluster nodes | `chronyc tracking` offset, TLS or token errors, a node `NotReady` with no other cause, name resolution errors; the handoff to the enterprise network team |
| N11 | A network automation change fails, or a switch configuration drifts from the intent | the automation controller event log, the switch agent state, the switch configuration against the intent; the switches keep the last configuration when the controller is down |

## Storage

| # | Runbook | Primary signals |
|---|---------|-----------------|
| S1 | Checkpoint write is slow or stalls | job logs, client throughput, server load, storage fabric counters |
| S2 | Dataloader stall (GPUs are idle, they wait for data) | DCGM SM activity in a saw-tooth pattern, client I/O latency, CPU use of the dataloader workers |
| S3 | Metadata storm on the parallel file system | metadata server load, operations for each client, the tenant that causes it |
| S4 | File system client hang or eviction on a node | client log, mount state, processes in the `D` state |
| S5 | Local NVMe failure or wear | SMART data, `nvme-cli`, kernel log |
| S6 | Storage capacity or quota exhaustion | capacity dashboards, quota reports |
| S7 | Slow model weight load for inference | load time against the expected bandwidth, the cache hit rate |

## Scheduler and platform

| # | Runbook | Primary signals |
|---|---------|-----------------|
| P1 | Pod or job cannot get GPUs (device plugin, DRA, or GRES problem) | allocatable resources, plugin logs, `slurmd` log |
| P2 | GPU Operator or Network Operator component in a crash loop | pod state, driver container log, kernel version change |
| P3 | Gang job stays in the queue (fragmentation, quota, or topology constraint) | queue state, free-capacity map, topology labels |
| P4 | Node is `NotReady`, or `slurmd` does not respond | kubelet or `slurmd` log, node pressure, the management network |
| P5 | Automatic remediation drains too many nodes (a false positive storm) | the drain rate, the health check that caused it, the circuit breaker state |
| P6 | Control plane overload at scale (API server, etcd, or `slurmctld`) | request latency, etcd size, the number of objects |
| P7 | Control-plane VIP or load balancer fault: the API server or the Rafay Controller is not reachable, but the nodes run | which node has the VIP, the load balancer health check (for the Rafay Controller: `/healthz/ready`), the TLS offload path against the TLS passthrough path, DNS |
| P9 | A host cannot be allocated, or an instance cannot be created (the host looks free) | the NICo machine state, the health classification (`PreventAllocations`), the maintenance flag, the SKU validation result, the state-machine SLA |
| P10 | A host is quarantined, or its firmware differs from the site baseline | the baseline inventory, the BMC and UEFI versions, the quarantine reason, the Flow operation run |

## Rafay (the platform of choice for cluster operation)

The signals in this table are from the public Rafay documentation (see sources/7-rafay-and-vast.md).
The GPU PaaS part of the Rafay documentation needs a login, so the runbooks R6 and R7 must be written with your Rafay account team.

| # | Runbook | Primary signals |
|---|---------|-----------------|
| R1 | Cluster shows "not reachable" in Rafay: the Management Operator cannot connect to the Rafay Controller | the cluster health signals (reachability, control plane health), the operator pods in the cluster, firewall, MTU, and proxy on the path to the controller |
| R2 | Blueprint sync failure: an add-on (GPU Operator, Network Operator, monitoring) does not deploy | the sync failure details in the console, add-on and cluster version compatibility, free disk space on the nodes, fleet override conflicts |
| R3 | Drift event: a manual change in a cluster is found or blocked | the drift audit event, the mode (notify or block), the blueprint version |
| R4 | A user cannot get `kubectl` access through Zero Trust Kubectl Access (ZTKA) | the role and project of the user, SSO state, the ZTKA connection, the `kubectl` audit log |
| R5 | Upstream Kubernetes (MKS) provision, node add, or upgrade fails | preflight test results, SSH and node details, node-to-controller connection, a worker node in `NotReady` |
| R6 | A tenant cannot get GPU capacity through the self-service catalogue (needs the login-only documentation) | the quota of the project, the free capacity, the environment deploy log |
| R7 | Self-hosted Rafay Controller is degraded (only if you operate the controller yourself) | the controller pods (`kubectl get pods -A` on the controller cluster), TLS certificates, the controller Grafana, the time-series database when dashboards do not load, the `relay-agent` pod for ZTKA faults, the `rcollect` support logs |
| R8 | Restore the self-hosted Rafay Controller from backup (the controller is lost) | the last completed Velero backup, the S3-compatible store, the restore settings of the controller configuration, the DNS cutover, the clusters that connect again |

## VAST Data (the platform of choice for storage)

These runbooks make S1 to S7 specific for VAST. The signals are from the public VAST knowledge base.

| # | Runbook | Primary signals |
|---|---------|-----------------|
| V1 | Low throughput from one client or one tenant | the mount options (`nconnect`, multipath, RDMA or TCP), the VAST NFS driver version, which VIPs and CNodes the client uses, a QoS policy that limits the view or the user, the `vperfcheck` baseline |
| V2 | Client I/O stops or is slow after a CNode failure or a CNode maintenance | VIP movement between CNodes, the VIP pool membership, stale mounts on the clients, the NFS timeout options |
| V3 | SSD failure alarm (for example `Carrier … SSD Failure`) | the alarm text, `dmesg` on the DNode, TLC or QLC behaviour, escalation to VAST support and RMA |
| V4 | PersistentVolumeClaim stays in `Pending`, or a pod cannot mount (VAST CSI driver) | the CSI controller and node pods, the StorageClass (secret, storage path, VIP pool or `vipPoolFQDN`), the view and the quota in VMS |
| V5 | Capacity or quota alarm, or the data reduction ratio changes | the capacity dashboards, the quotas of the tenant, the similarity reduction report |
| V6 | VMS is not available, or must move to a different CNode | the VMS VIP, `vms list` and `vms modify --preferred-cnode-ids`, the "VMS Preferred" VIP pool method |
| V7 | Call Home or log upload does not work | outbound TCP 443 from the VMS and the node management addresses to the VAST endpoints |
| V8 | Evidence for VAST support | the correct support bundle preset (for example Performance, NFS, HW, RCA), made in the Web UI or with `supportbundle create` |

## Inference services

| # | Runbook | Primary signals |
|---|---------|-----------------|
| I1 | TTFT or ITL regression | queue time, KV cache use, batch size, the recent changes |
| I2 | Replica out-of-memory or crash loop | the server log, the GPU memory budget, the maximum sequence configuration |
| I3 | Autoscaling is too slow (cold start and weight load) | scale events, image pull time, weight load time |

## Facility

| # | Runbook | Primary signals |
|---|---------|-----------------|
| F1 | CDU or coolant loop alarm | coolant flow, supply and return temperature, leak detection |
| F2 | Rack power event (PDU or power shelf) | BMC power telemetry, the facility alert |
| F3 | Emergency thermal shutdown of a rack or a row: the drain sequence and the customer message | facility telemetry, the affected jobs list |

## Lifecycle procedures (not caused by an alert)

| # | Procedure |
|---|-----------|
| L1 | Node drain, repair, burn-in, and return to service |
| L2 | RMA evidence package (`nvidia-bug-report`, DCGM diagnostics output, the Xid history, the serial numbers; on Dell servers also the SupportAssist collection, which you must export and attach to the case by hand) |
| L3 | New node or new rack acceptance test (DCGM level 4, `nccl-tests` intra-node and inter-node, storage benchmark, HPL or a training benchmark); for a new cluster, a new phase, or a new scalable unit, the full [cluster-onboarding.md](cluster-onboarding.md) |
| L4 | Rolling driver, firmware, or operating system upgrade with a canary group |
| L5 | Fabric change (cable replacement, switch firmware) on a live cluster |
| L6 | On-call handover and the weekly reliability review |
| L7 | Change procedure: standard, normal, and emergency changes; the compatibility check, the canary group, the success criteria, the rollback; the change record for the KPIs |
| L8 | RMA governance: the OEM case flow, the evidence package (L2), the spare-parts pool by component, the awaiting-RMA state, the turnaround KPI |
| L9 | Physical check of a node or a rack: find it, read the indicators, compare with iDRAC ([onsite-procedures.md](onsite-procedures.md)) |
| L10 | FRU replacement under the OEM procedure: hot-swap or cold-swap, drain, ESD, serial numbers, burn-in |
| L11 | Optic and cable work: find both ends, clean and inspect, then the link counters and the port map |
| L12 | RMA receiving and return: part and serial check, the evidence (L2), return shipping, the spare pool |
| L13 | Work permit and the facility boundary: access, power isolation, alarms that go to the facility team |
| L14 | As-built update after a physical change: port map, rack layout, CMDB |
| L15 | Backup verification and restore test of the management planes: the backup matrix, the scheduled restore drill, the measured RTO (M10) |
| L16 | Tenant onboarding: the organization, the identity provider group and the role, the project, the quota, the network isolation, the storage view and quota, the audit check (M9) |
| L17 | Daily health check (each day in hypercare, then each week): capacity by state, lost GPU hours, incidents, defects, planned work, vendor cases, backups, noisy alerts, risks ([shift-discipline.md](shift-discipline.md)) |
| L18 | Problem record and known error: when to open one, the fields, the Known Error Database entry, the permanent fix and its owner ([shift-discipline.md](shift-discipline.md)) |
| L19 | Break-glass access: the approval, the offline accounts, the log of each use, the credential change after use ([security-operations.md](security-operations.md)) |
| L20 | A suspected security event: report, do not wipe, isolate only on request, preserve the evidence ([security-operations.md](security-operations.md)) |
| L21 | Vendor advisory and end-of-support review: the sources, the decision for each advisory (patch now, next window, accept with a reason), the change record (M10) |
| L22 | Configuration drift check: BIOS, firmware, and OS settings against the approved baseline, on a schedule; each difference becomes a change or a defect (M10) |
