# Concepts Checklist

**Use:** tick a box only when you can explain the concept and show it on a live system.
Do it at the end of each module, and again before your first primary on-call shift.
The sections are by domain, not by module; one module can fill boxes in more than one section.

Two groups in each section: **Before on-call** (tick all before the capstone) and **First 90 days**.
Lines marked "(M if your fleet has AMD nodes)" move to the first group on a mixed fleet.

## 1. Facility and rack

**Before on-call:**
- [ ] The structure of the cluster: scalable units, racks, and the four networks (compute, storage, in-band management, out-of-band management).
- [ ] The rack power budget, the power per GPU, and what a power cap does to performance.
- [ ] Liquid cooling basics: the CDU, the coolant loops, the supply and return temperature, the flow rate, and leak detection.
- [ ] The blast radius of a facility fault: one PDU, one CDU, one row.

**First 90 days:**
- [ ] Power usage effectiveness, and the relation between the facility telemetry and the GPU throttle events.

## 2. GPU and node hardware

**Before on-call:**
- [ ] The GPU parts: compute cores, HBM, NVLink, and the PCIe connection.
- [ ] The hardware types in [hardware-matrix.md](hardware-matrix.md): the Hopper HGX server, the Blackwell HGX server, and the NVL72 rack. For each one: the size of the NVLink domain, the cooling type, and what this changes for failures and for scheduling.
- [ ] NVLink and NVSwitch: the bandwidth, the topology, and the role of Fabric Manager (with the NVLink Subnet Manager on HGX B200 and B300, and IMEX on NVL72).
- [ ] The PCIe topology, NUMA, and the GPU-to-NIC affinity (`nvidia-smi topo -m`).
- [ ] ECC in HBM: correctable and uncorrectable errors, row remapping, when a reset is necessary, and the remap failure that means RMA.
- [ ] BMC, Redfish, and IPMI: sensors, the system event log, and remote power control.
- [ ] One scale-out NIC for each GPU (ConnectX-8 on HGX B300), and what a fault of one NIC or one port takes down.

**First 90 days:**
- [ ] PCIe AER errors, ACS, IOMMU, and their effect on peer-to-peer traffic.
- [ ] The CPU side: Grace against x86 hosts, the CPU governor, and the memory bandwidth for dataloaders.

## 3. Node software

**Before on-call:**
- [ ] The driver, CUDA, and firmware compatibility matrix, and why version drift in a fleet is a risk.
- [ ] The NVIDIA Container Toolkit, and how a container gets a GPU.
- [ ] DCGM: the health checks, the diagnostics levels, the policies, and the field identifiers.
- [ ] The Xid error classes: caused by the application, caused by hardware, and those that need a reset, a reboot, or an RMA.
- [ ] The throttle reasons (power, thermal, hardware slowdown).
- [ ] `nvidia-bug-report.sh` and the evidence for an RMA.

**First 90 days:**
- [ ] On AMD Instinct: `amd-smi`, the ROCm Validation Suite, the ROCm compatibility matrix, and the AMDGPU RAS error classes (`ue`, `ce`, `poison`) in place of Xid codes (M if your fleet has AMD nodes).
- [ ] MIG and time-slicing.
- [ ] GSP firmware, persistence mode, and the driver loading sequence.

## 4. Compute fabric

**Before on-call:**
- [ ] RDMA: queue pairs, kernel bypass, and GPUDirect RDMA.
- [ ] Topologies: fat-tree, rail-optimized, and oversubscription.
- [ ] InfiniBand: the subnet manager, adaptive routing, credit-based flow control, SHARP, and UFM.
- [ ] RoCEv2: PFC, ECN, DCQCN, lossless traffic classes, PFC storms, and head-of-line blocking.
- [ ] The port counters and what each one means: symbol errors, link downed, receive errors, transmit discards, and congestion counters.
- [ ] Optics and cables as the most frequent fault: link flaps and bit error rate.
- [ ] The diagnostic tools: `ibstat`, `iblinkinfo`, `perfquery`, `ibdiagnet`, `mlxlink`, `ib_write_bw`, and `ethtool -S`.
- [ ] The networks of one cluster (the compute fabric, the frontend and storage Ethernet, the control plane), and the dependencies outside the cluster (DNS, NTP, IPAM, the firewall) with their owners.
- [ ] UFM in HA: which unit is active, and where the configuration backup is after a failover.
- [ ] The effect of a subnet manager failover on running jobs.
- [ ] The source of a RoCE PFC storm: the port that sends pause frames but receives none.

**First 90 days:**
- [ ] Tenant isolation: PKeys, VLAN and VRF, and DPU-based isolation.
- [ ] The Ultra Ethernet direction and Spectrum-X adaptive routing internals.

## 5. Collective communication

**Before on-call:**
- [ ] The collectives and which parallelism uses each one.
- [ ] The ring, tree, and NVLS algorithms, and the relation between algorithm bandwidth and bus bandwidth.
- [ ] The expected bus bandwidth for your hardware, intra-node and inter-node.
- [ ] How NCCL finds the topology and selects the transport, how to read `NCCL_DEBUG=INFO`, and the checks when the transport falls back on new hardware (peermem, ACS, HCA, NUMA).
- [ ] The primary NCCL environment variables, and the risk of stale variables that customers copy from old guides.
- [ ] The straggler effect: one slow component slows the full job.
- [ ] The NCCL timeout and hang: the watchdog, Flight Recorder, and NCCL RAS.

**First 90 days:**
- [ ] On AMD Instinct: RCCL and `rccl-tests`, and the AMD Infinity Fabric links in place of NVLink (M if your fleet has AMD nodes).
- [ ] SHARP and in-network reduction, and the NCCL tuner and network plugins.

## 6. Storage

**Before on-call, storage in general:**
- [ ] The tiers: local NVMe, the parallel file system, and the object store.
- [ ] The parallel file system architecture: metadata against data servers, striping, and client cache.
- [ ] The I/O patterns: dataset read, checkpoint burst write, and model weight load.
- [ ] Checkpoint mathematics: the size, the write time, the interval, and asynchronous checkpointing.
- [ ] How to see a dataloader stall, a storage stall, and a checkpoint write in the GPU metrics.
- [ ] The tools: `fio`, `mdtest` or `elbencho`, `iostat`, and `biolatency`.

**Before on-call, VAST Data:**
- [ ] the components (CNode, DNode, DBox, CBox, EBox, the Element Store), and the function of each one.
- [ ] the client protocols, the VAST NFS client driver, and the mount options for high throughput and multipath.
- [ ] VIP pools: how client connections are balanced across the CNodes, and what moves on a CNode failure.
- [ ] tenants, views, quotas, and QoS, and how one tenant is isolated from a different tenant.
- [ ] VMS, the REST API, `vastpy-cli`, the Prometheus exporter, the alarms, and the support bundle presets.
- [ ] the VAST CSI driver: StorageClass, secret, storage path, and VIP pool.

**First 90 days:**
- [ ] VAST Data: similarity-based data reduction and its effect on capacity reports.
- [ ] NVMe-oF and GPUDirect Storage.
- [ ] Dataset cache layers and streaming dataset formats.
- [ ] The MLPerf Storage benchmark as a reference.

## 7. Orchestration and lifecycle

**Before on-call, Kubernetes, Slurm, and the fleet:**
- [ ] Kubernetes: GPU Operator, Network Operator, the device plugin, DRA, and Topology Manager.
- [ ] Gang scheduling, queues, quotas, and topology-aware placement.
- [ ] Slurm: the daemons, GRES, the topology plugin, prolog and epilog, and `pyxis` with `enroot`.
- [ ] Node health automation: passive monitoring, active tests between jobs, and automatic drain with a circuit breaker.
- [ ] The node state machine and the return-to-service criteria.
- [ ] Burn-in and acceptance tests ([cluster-onboarding.md](cluster-onboarding.md)).
- [ ] Rolling upgrades with a canary group, and the job order: preemptible work first, long training at its checkpoint.
- [ ] Change management: standard, normal, and emergency changes; the compatibility check; the rollback plan; the change KPIs.
- [ ] Automation guardrails: the allow-list, the blast-radius cap, the audit trail; RMA governance and the spare-parts pool.
- [ ] Backup and restore of a management plane: RPO and RTO, full and incremental backups, a restore to new hardware and a DNS cutover; a backup is proven only by a restore test.
- [ ] Configuration drift against the approved baseline, and the vendor advisory review.

**Before on-call, the bare-metal lifecycle (if the site uses NICo):**
- [ ] Day 0: the Expected Machine, Redfish discovery, DPU pairing, SKU validation, burn-in, the firmware baseline, attestation, and quarantine.
- [ ] Day 1: the isolation on each plane (VXLAN/EVPN and VRFs, UFM P_Key, NMX-C, Spectrum-X), the UEFI lockdown, the iPXE install, and the instance types.
- [ ] Day 2: the health sources, the firmware update on an unoccupied host, sanitization, and the network cleanup with the convergence gate.
- [ ] The health classifications: `PreventAllocations`, `PreventInstanceDeletion`, `PreventHostStateChanges`, `SuppressExternalAlerting`, `ExcludeFromStateMachineSla`, and the sensor classes.
- [ ] Online repair against full repair, and the repair tenant.
- [ ] Flow: an operation rule, a task schedule, and an operation run with phases and a safety gate.

**Before on-call, the scheduler policy:**
- [ ] Queue quota, limit, over-quota weight, and priority; the guaranteed quota against the surplus.
- [ ] Queue priority against workload priority; preemption against reclaim; the quota protection guarantee.
- [ ] Gang scheduling, the PodGroup, `minMember`, and the hierarchical sub-groups.
- [ ] Topology-aware scheduling: the levels, the required and the preferred placement, and the bin-packing rule.
- [ ] The GPU-sharing modes, the admission rules, and the readiness condition.
- [ ] The DRA binder and the `BindRequest`.
- [ ] The Run:ai platform model: department and project queues per node pool, deserved quota, over-quota, rank, limit, fairshare, and semi-preemptible workloads.

**Before on-call, Rafay:**
- [ ] the Rafay Controller and the Management Operator in each cluster, and what stops when the connection between them is lost.
- [ ] blueprints and add-ons, cluster overrides, blueprint versions, and drift detection (notify or block).
- [ ] organizations, projects, and namespaces; roles; SSO; Zero Trust Kubectl Access and the audit log.
- [ ] the cluster lifecycle for upstream Kubernetes on bare metal: provision, upgrade, node add and remove, and the documented failure cases.
- [ ] the dashboards, the alerts, the three cluster health signals, and the `rctl` CLI.
- [ ] the self-hosted controller: HA, the DNS names, the two load-balancer paths, and where to look when the console does not open.
- [ ] tenant onboarding (procedure L16): the organization, the identity provider group, the project, the quota, the isolation, the audit check.

**First 90 days:**
- [ ] Rafay: Environment Manager, the Terraform provider, the REST API, and GitOps System Sync.
- [ ] Rafay: the GPU PaaS functions for tenants (the documentation needs a login).
- [ ] On AMD Instinct: the AMD GPU Operator and the `amd.com/gpu` resource; node labels that keep one job on one hardware type (M if your fleet has AMD nodes).
- [ ] Slurm on Kubernetes (Slinky, SUNK).
- [ ] The provisioning tool internals (Base Command Manager or your tool).
- [ ] Sandboxed and confidential containers with GPUs.

## 8. Workload literacy

**Before on-call:**
- [ ] The training memory budget: parameters, gradients, optimizer state, and activations.
- [ ] Data, tensor, pipeline, expert, and context parallelism, and FSDP or ZeRO; which one uses NVLink and which one uses the fabric.
- [ ] Checkpoint and restart; elastic and fault-tolerant training.
- [ ] The customer-visible failures: NCCL timeout, hang, out-of-memory, loss spike, NaN.
- [ ] Inference: prefill and decode, KV cache, continuous batching, TTFT, ITL, and throughput.

**First 90 days:**
- [ ] Disaggregated serving, KV cache offload, and speculative decoding.
- [ ] Silent data corruption: how it shows, and how operators find the defective GPU.
- [ ] Inference triage: TTFT split into queue and prefill, prefix caching, KV-cache preemption, chunked prefill, and the cold start of a replica.

## 9. Observability and SLOs

**Before on-call:**
- [ ] The metric sources of each layer, and the owner of each one.
- [ ] Why GPU utilization is misleading, and the DCGM profiling metrics to use, with their field names.
- [ ] The log pipeline for the kernel, Xid, subnet manager, and scheduler events.
- [ ] NVIDIA GPU RAS event categories in DCGM (fatal: ECC, NVLink/PCIe, Xid; non-fatal: page-retirement limit; performance: thermal/power) and how they become alerts and SLI inputs.
- [ ] The SLIs of an AI cloud: node availability, goodput, ETTR, job interruption rate, time to detect, and time to repair.
- [ ] The RFP KPI set: GPU capacity availability, MTTA, MTTE, MTTR by priority, nodes in each state, alert quality, lost GPU hours, firmware compliance, RMA turnaround.
- [ ] Alert routing: Alertmanager grouping, inhibition, silences, and the webhook to the ITSM and the SIEM.
- [ ] Alerts on symptoms and on SLO burn rate (multi-window); alert fatigue control.
- [ ] The capacity view: the GPUs in each state, and the lost GPU hours of each state.
- [ ] The alert catalogue: the severity, the RFP priority, the runbook, and the owner of each alert.

**First 90 days:**
- [ ] On AMD Instinct: the AMD Device Metrics Exporter, and alert rules on RAS counters in place of Xid events (M if your fleet has AMD nodes).
- [ ] Metric storage at scale (cardinality, long-term storage).
- [ ] Correlation of job identifiers with node, GPU, and port identifiers.

## 10. Performance prediction

**Before on-call:**
- [ ] Training FLOPs, MFU, and tokens per second per GPU.
- [ ] The roofline model: compute-bound, memory-bound, or communication-bound.
- [ ] The all-reduce time from the message size and the bus bandwidth; scaling efficiency.
- [ ] Cluster MTBF from the node MTBF, the expected interruptions for a job, and the optimal checkpoint interval (Young and Daly).
- [ ] Inference capacity: the KV cache memory and the maximum concurrency.

**First 90 days:**
- [ ] Simulators for large jobs (ASTRA-sim, SimAI).
- [ ] MLPerf Training and Inference results as reference values.

## 11. Troubleshooting and incident response

**Before on-call:**
- [ ] The USE method for each layer.
- [ ] Divide the problem: one against many, what changed, the fault count (one node is hardware; many identical nodes share a cause: a change or the infrastructure), and the bisection search.
- [ ] The remediation ladder and the blast radius of each step.
- [ ] The incident roles, the communication rhythm, and the customer messages.
- [ ] Blameless postmortems and the follow-up of actions; the RCA timelines (24 h preliminary, 5 business days full) and the hypercare period.
- [ ] The profiling tools at a first level: Nsight Systems, PyTorch Profiler, `py-spy`.
- [ ] The P1 to P4 priorities and their clocks, and how the affected GPU capacity sets the priority.
- [ ] The problem record and the Known Error Database.
- [ ] Break-glass access and a suspected security event: what you do, and what you must not do.
- [ ] The drain sequence before an emergency thermal shutdown (RB-10).
- [ ] The machine-assisted diagnosis: the symptom chain, the diagnosis fields (`terminal_state`, `sub_domain`, failure class, responsible node), the `ambiguous` and `unattributed` states, and the recovery policy.
- [ ] The failure taxonomy: exit 137 is SIGKILL, not a cause; the kubelet reason beats the exit code; recurrence is a finding.

**First 90 days:**
- [ ] BPF tools and `perf` for host problems.
- [ ] The reliability review: trend analysis of the failure classes, and the supplier quality feedback.
