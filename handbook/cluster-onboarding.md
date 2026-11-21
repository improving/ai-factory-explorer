# New Cluster Onboarding Checklist

- **Use:** when a new cluster, a new delivery phase, or a new scalable unit comes to the SRE team.
- **Not for:** one node or one rack.
  For these, use the procedures L3 (acceptance test) and L1 (drain, repair, burn-in, and return)
  of the [runbook catalogue](runbook-catalog.md#lifecycle-procedures-not-caused-by-an-alert).
- **Who:** the implementation team:
  L3-C, L3-P, Onsite, and the L2 who join the installation
  (role-paths.md, wave 1).
- **Output:** the signed checklist,
  the evidence package,
  and the baseline numbers in the runbooks.

## The four phases

| Phase | What you do | Result |
|-------|-------------|--------|
| [0. Get the documents](#phase-0-get-the-documents) | Collect the reports, the designs, and the expected numbers | The references for each check |
| [1. Check each layer](#phase-1-check-each-layer) | Check each layer of the layer model, from the bottom to the top | Every node, link, and port is correct |
| [2. End to end and burn-in](#phase-2-end-to-end-and-burn-in) | Test the full cluster under load for a long time | The performance baselines |
| [3. Ready for on-call](#phase-3-ready-for-on-call) | Connect the telemetry, the runbooks, and the processes | The cluster is operable |

Then do the [sign-off](#sign-off).

## Where the health checks run

Most AI factory stacks do not run all the health checks automatically when you install them.
The checks run in four places:

| Place | When | Depth | What it finds |
|-------|------|-------|---------------|
| Bring-up and acceptance | One time, before the handover; the integrator or the vendor runs it | The full suite, with burn-in | Cabling and topology faults: the only place that finds them reliably |
| Per-job checks | Before and after each job: the Slurm prolog and epilog, or a Kubernetes node readiness gate | Short: seconds to a few minutes | A node that became defective after the last job |
| Scheduled active tests | Between jobs, on a schedule, and more after a bad training day | Micro-benchmarks and workload tests at node, rack, and multi-rack scale | A slow node or rack (a straggler) that passes every per-job check |
| Continuous telemetry | Always; passive | Error counters, link state, Xid events | Degradation over time, but not a miswired cable that links up |

**Do not assume that the acceptance tests ran.**
Ask for the acceptance test report,
and read it (Phase 0).
NVIDIA Base Command Manager and Mission Control have a health-check framework,
but the checks that are on by default change with the version and with the integrator.

## How to use this checklist

1. **Do the phases in sequence.**
   In Phase 1, also do the layers in sequence:
   a fault in a low layer causes symptoms in all the layers above it.
2. **Check everything, not a sample.**
   Run each check on every node, every link, and every port:
   one bad link slows every job that uses it.
3. **Save each output in a file,** with the node name and the date.
   The files are the evidence package.
   The next class uses them as T0 lab material
   (learning-hardware.md, rule 2).
4. **Record each failure as a defect** on the handover punch list,
   with an owner and a date.
5. **Look up the commands** in [command-reference.md](command-reference.md).
   A command marked *(check the flags)* is standard,
   but its options depend on your version:
   run `--help` first.

Each check has the same parts:

- **Run:** the command.
- **Pass:** the result that you must see.
- **Why:** what the check finds, when it is not obvious.

Each section starts with the module that teaches it,
the runbooks that use it,
and the hands-on units where you can practice it.

## Phase 0: Get the documents

Without these documents, you cannot say if a check passed.

- [ ] **The acceptance test report.**
  It gives the tests, the diagnostics levels, the result for each node and each link, the software versions, and the dates.
  A summary that says "all passed" is not sufficient.
- [ ] **The low-level design (LLD), the cabling plan, and the port map.**
  Also the expected InfiniBand topology file,
  and the expected LLDP neighbours of the Ethernet fabrics.
  They are the reference for the topology checks of Phase 1,
  and for the as-built record
  (procedure L14, [onsite-procedures.md](onsite-procedures.md#l14--as-built-update-after-a-physical-change)).
- [ ] **The approved version baseline.**
  BIOS, BMC, GPU VBIOS, GPU driver, CUDA, Fabric Manager,
  HCA and NIC firmware, DOCA or OFED, the switch operating system,
  the GPU Operator, and the Network Operator.
  Check the combination against the compatibility matrices
  (M10, change management).
  This baseline is the reference for the drift check (procedure L22).
- [ ] **The expected performance numbers.**
  Get them from the reference architecture of your hardware
  ([hardware-matrix.md](hardware-matrix.md#table-2--the-tools-and-the-signals), row "Acceptance test guide"):
  - the NCCL bus bandwidth (M4 gives the method);
  - the NVLink bandwidth;
  - the RDMA bandwidth of each rail;
  - the storage throughput of each client;
  - the HPL result.

  When the vendor does not give a number,
  calculate it with the method of M6.
- [ ] **The inventory.**
  The serial number, the location, and the firmware of each asset, in the CMDB.
- [ ] **The support path.**
  The vendor support contracts and the escalation contacts;
  the RMA flow and the spare-parts pool (procedure L8);
  the facility contacts (procedure L13).
- [ ] **The access.**
  Named accounts through the identity provider;
  the break-glass accounts
  (procedure L19, [security-operations.md](security-operations.md#l19--break-glass-access));
  no default BMC or switch passwords.

## Phase 1: Check each layer

### 1. Facility and rack

> - **Module:** M1
> - **Runbooks:** F1 to F3 ([runbook-catalog.md](runbook-catalog.md#facility))

- [ ] **Power.**
  Pass: each PSU is present and redundant,
  and each rack is in its power budget at full load.
  Read the peak power during the burn-in of Phase 2, not at idle.
- [ ] **Cooling.**
  Pass: on liquid-cooled racks,
  the coolant flow and the supply and return temperatures of each CDU are in the specified range.
- [ ] **Alarms.**
  Pass: a leak detection alarm and a CDU alarm go to the facility team and to the on-call team.
  Test one alarm with the facility team;
  do not assume the route.

### 2. Node and firmware baseline

> - **Module:** M1
> - **Runbooks:** G9, G10; procedure L22
> - **Practice:** [H00](../handson/00-orientation/README.md);
>   [H04](../handson/04-node-daemon-and-shims/README.md) (`lspci`);
>   [H11](../handson/11-dcgm-nvlink-fabric/README.md) Part A (`topo -m`)

- [ ] **The versions are the same on all nodes, and they agree with the baseline.**
  BIOS, BMC, VBIOS, driver, CUDA, HCA and NIC firmware, DOCA or OFED.
  Run: one script on all nodes that collects the versions;
  compare the outputs, do not read them by hand.
  Why: a version mismatch causes many "intermittent link" problems.
- [ ] **The BMC is healthy.**
  Run: `ipmitool sensor` and `ipmitool sel list`, or Redfish.
  Pass: the PSUs, fans, and temperatures are in range;
  the system event log has no hardware events.
- [ ] **The device count is correct.**
  Run: `nvidia-smi -L`, `ibstat`, and `nvme list`.
  Pass: each node shows the expected number of GPUs, HCAs, and NVMe drives.
- [ ] **Each PCIe link trained at its full speed and width.**
  Run: `lspci -vv` *(check the flags)*.
  Pass: for each GPU, NIC, and NVMe drive, `LnkSta` is equal to `LnkCap`.
  Why: a slot that trained at Gen4 x8 in place of Gen5 x16 operates, but slowly,
  and no alert finds it.
- [ ] **The GPU-to-NIC affinity is correct.**
  Run: `nvidia-smi topo -m` and `lstopo`.
  Pass: each GPU and its NIC are under the same PCIe switch (`PIX` or `PXB`),
  on the same NUMA node.
- [ ] **The lifecycle record exists for each host, if the site uses NICo.**
  Run: `nicocli machine get <id> -o json` for one host of each type.
  Pass: the machine has an `Expected Machine` record, a SKU validation result, and a firmware inventory;
  the state is `Ready` or `Available`, and no health classification blocks it.
  Why: a host that is not in the lifecycle system is not in the capacity plan,
  and its firmware is not in the baseline.
- [ ] **The firmware baseline is enforced, not only observed.**
  Run: compare each host's BMC and UEFI versions with the site baseline.
  Pass: every host matches, or the difference is an approved exception with an owner.
  Why: a host that is below the baseline is quarantined on the next ingestion,
  and the quarantine is a surprise on the day of the change.
- [ ] **The local disks are healthy.**
  Run: `nvme smart-log`.
  Pass: no media errors;
  the free space is sufficient for the container images and the local cache.

### 3. GPU health

> - **Module:** M2
> - **Runbooks:** G1 to G8
> - **Practice:** [H02](../handson/02-runtime-control/README.md);
>   [H03](../handson/03-troubleshooting/README.md);
>   [H11](../handson/11-dcgm-nvlink-fabric/README.md) Part D

- [ ] **DCGM diagnostics pass on every GPU.**
  Run: `dcgmi diag -r 4` (extended; drain the node first).
  Pass: every test passes on every GPU.
  Why: the long levels test the memory, the PCIe bandwidth, the power, and targeted stress.
  Level 1 takes seconds: it is the per-job check of Phase 3.
  Level 3 takes approximately 15 min: it is the return-to-service check.
- [ ] **No memory errors.**
  Run: `nvidia-smi -q -d ECC,ROW_REMAPPER`.
  Pass: no uncorrectable ECC errors,
  no pending row remaps,
  and no row remap failures.
- [ ] **No Xid events.**
  Run: `dmesg -T | grep -i xid` on every node,
  after the diagnostics and again after the burn-in.
  Pass: no Xid events.
  These are the most important:
  - 48, 63, 64, 94, 95, and 140: memory (runbook G2);
  - 74 and 149: NVLink (runbook G3);
  - 79: the GPU fell off the bus (runbook G1).
- [ ] **No clock throttle.**
  Run: `nvidia-smi -q -d PERFORMANCE` while the GPUs are under load.
  Pass: no thermal, power-brake, or hardware slowdown reason.
- [ ] **No slow GPU.**
  Compare the diagnostics and benchmark results of each GPU with the other GPUs of the same type.
  Why: a GPU that is 5 to 10 % slower than the others slows every collective that it is part of (runbook G8).

### 4. Scale-up fabric: NVLink and NVSwitch

> - **Modules:** M1, M2;
>   the services for each hardware type are in [hardware-matrix.md](hardware-matrix.md#table-2--the-tools-and-the-signals)
> - **Runbooks:** G3, G7
> - **Practice:** [H11](../handson/11-dcgm-nvlink-fabric/README.md);
>   [H10a](../handson/10-advanced-guides/compute-domain.md) (ComputeDomain and IMEX)

- [ ] **Each NVLink is up at its full speed.**
  Run: `nvidia-smi nvlink -s` *(check the flags)*.
  Pass: each link is up, at the expected speed.
- [ ] **The NVLink error counters do not increase.**
  Run: `nvidia-smi nvlink -e` *(check the flags)*,
  before and after the burn-in.
  Pass: the CRC, replay, and recovery counters are zero, or they did not increase.
- [ ] **Fabric Manager is active, and the fabric training is complete.**
  Run: `systemctl status nvidia-fabricmanager` and `journalctl -u nvidia-fabricmanager`.
  On HGX B200 and B300, also check the NVLink Subnet Manager (NVLSM).
- [ ] **NVL72 racks only: the NVLink domain is complete.**
  Pass: all the compute trays and switch trays are in the domain;
  the tray firmware agrees with the baseline;
  the IMEX service is healthy on each compute tray (`nvidia-imex-ctl` *(check the flags)*).
  On Kubernetes: a test `ComputeDomain` starts across the rack
  (M9).
- [ ] **The NVLink bandwidth is correct.**
  Run: `nvbandwidth` *(check the flags)*.
  Pass: the GPU-to-GPU and host-to-GPU bandwidths agree with the expected numbers.
- [ ] **An NCCL all-reduce inside one node, or inside one NVL72 rack, is correct.**
  Pass: the bus bandwidth agrees with the expected number.
  Why: this test uses only NVLink,
  so it separates an NVLink fault from a scale-out fabric fault
  (M4).

### 5. Compute fabric: InfiniBand

Most link faults are found in this layer.

> - **Module:** M3
> - **Runbooks:** N1, N2, N7, N9
> - **Practice:** the M3 No-HW lab (a supplied `ibdiagnet` output);
>   [H12](../handson/12-infiniband-fabric/README.md);
>   the ibsim labs [IB07](../handson/13-ibsim-real-fabric/lab07/README.md) (`ibnetdiscover`),
>   [IB10](../handson/13-ibsim-real-fabric/lab10/README.md) (link failure),
>   and [IB17](../handson/13-ibsim-real-fabric/lab17/README.md) (failure injection)

- [ ] **The full fabric scan is clean.**
  Run: `ibdiagnet`.
  Pass: it finds none of these faults:
  - a topology that is different from the expected topology file,
    in the UFM topology compare or with the topology option of `ibdiagnet` *(check the flags)*:
    this finds a **miswired cable that links up**;
  - a link below its speed or width,
    for example NDR at HDR, or 2x in place of 4x
    (`iblinkinfo` shows the same);
  - duplicate GUIDs or LIDs, routing faults, and credit loops;
  - a high bit error rate (BER) on a port: raw, effective, or symbol.
- [ ] **The cables and optics are healthy.**
  Run: `mlxlink -d <device> -p <port>` *(check the flags)*, or the UFM cable validation.
  Pass: the transceiver temperature,
  the Rx and Tx optical power of each lane,
  the FEC mode,
  and the BER before and after FEC are in range.
  Why: a high raw BER is the first sign of a cable that will start to flap.
- [ ] **The port counters do not increase under traffic.**
  Run: clear the counters after the bring-up (`perfquery -R` or `ibdiagnet --pc` *(check the flags)*),
  send traffic (Phase 2),
  then read them with `perfquery -x`.
  Pass: no increase of SymbolErrorCounter, LinkErrorRecoveryCounter, LinkDownedCounter, PortRcvErrors, or PortXmitDiscards.
- [ ] **The subnet manager is correct.**
  Pass: one master;
  a standby that takes over in a failover test;
  the routing engine and the adaptive routing that the design specifies
  ([IB12](../handson/13-ibsim-real-fabric/lab12/README.md), [IB14](../handson/13-ibsim-real-fabric/lab14/README.md)).
- [ ] **The discovered topology agrees with the intent.**
  Run: `ibnetdiscover`, NetQ, or topograph against the LLD.
  Pass: each node is on the leaf and the rail that the LLD names.
  A difference is either a documentation error or an unrecorded change;
  both go in the change record.
  Why: a node on the wrong rail works, and its traffic crosses a spine.
- [ ] **RDMA works on each rail.**
  Run: `ib_write_bw` and `ib_write_lat` between node pairs, on each HCA.
  Pass: the results agree with the expected numbers.
  Why: this test does not use NCCL,
  so it separates a fabric fault from a NCCL fault.

### 6. Compute fabric: Ethernet (Spectrum-X, RoCE)

Remove this section if the cluster has no RoCE network.

> - **Module:** M3
> - **Runbooks:** N6, N11

- [ ] **The cabling agrees with the plan.**
  Run: `lldpctl` on the host,
  or `nv show interface <port> lldp` on Cumulus Linux *(check the flags)*.
  Pass: the LLDP neighbour of each port agrees with the port map.
  Why: this is the Ethernet equivalent of the InfiniBand topology check.
- [ ] **The MTU is the same from end to end:**
  on the NICs, the leaf switches, and the spine switches.
- [ ] **The lossless configuration is the same on the NICs and on the switches:**
  PFC, ECN, the DSCP or trust mapping, and the buffer settings.
  Why: a wrong setting passes a `ping` test,
  but the fabric collapses under load.
- [ ] **The optics are healthy.**
  Run: `mlxlink`, as for InfiniBand.
- [ ] **The counters do not increase under traffic.**
  Run: `ethtool -S <nic>` on the hosts;
  the switch counters on the switches.
  Pass: no increase of FCS errors, pause frames, ECN marks, or drops.
- [ ] **The fabric validation tool is clean,**
  if the site has one (for example NVIDIA NetQ).
- [ ] **RDMA works on each rail.**
  Run: `ib_write_bw` between node pairs, on each NIC.

### 7. Storage and the data path

> - **Module:** M8
> - **Runbooks:** S1 to S7, V1 to V8

- [ ] **Each node mounts the storage with the correct options.**
  Run: `nfsstat -m`.
  Pass: the multipath options of the mount row of [command-reference.md](command-reference.md#storage-vast-data).
- [ ] **Each node reaches the expected throughput.**
  Run: `fio` from every node, and `vperfcheck` on VAST.
  Why: a test from every node finds the one slow storage NIC or the one wrong mount.
- [ ] **GPUDirect Storage works,**
  if the workloads use it.
  Run: `gdscheck -p` *(check the flags)*.
- [ ] **The local NVMe cache is healthy,**
  if the design has one.
  Run: `nvme smart-log` and a `fio` test.

### 8. Management network and the base services

> - **Module:** M3
> - **Runbook:** N10

- [ ] **Each BMC is reachable** on the out-of-band network.
- [ ] **Time is synchronized.**
  Run: `chronyc tracking` on every node.
  Pass: the offset is small,
  and the source is the site NTP (or PTP) server.
- [ ] **DNS resolves** each node name, each BMC name, and each management service name,
  in both directions.

### 9. Platform: Kubernetes through Rafay, or Slurm

> - **Modules:** M9, M10
> - **Runbooks:** P1 to P4, R1 to R4
> - **Practice:** [H05](../handson/05-device-plugin/README.md);
>   [H06](../handson/06-dra-driver/README.md);
>   [H07](../handson/07-gpu-operator/README.md)

Kubernetes:

- [ ] **Each node is `Ready`, and the cluster is healthy in Rafay.**
  Run: `kubectl get nodes -o wide`.
- [ ] **The operators are healthy.**
  Run: `kubectl get pods -n gpu-operator`, and the same for the Network Operator.
  Pass: all the pods are `Running`.
- [ ] **Each node advertises the correct resources.**
  Run: `kubectl describe node <node>`.
  Pass: the allocatable `nvidia.com/gpu` count and the RDMA resources agree with the hardware;
  the Node Feature Discovery labels (GPU model, driver) are correct.

Slurm:

- [ ] **The GRES configuration agrees with the hardware.**
  Run: `scontrol show node <node>` and `sinfo -R`.
  Pass: every node is idle, and no node is drained.
- [ ] **The node health checks are connected.**
  Pass: the prolog, the epilog, and `HealthCheckProgram` run,
  and they can drain a node.
  For example, use the LBNL Node Health Check.

Both:

- [ ] **The container runtime gives the GPUs to a container.**
  Run: `nvidia-smi` in a test pod or a `srun` job.
  Pass: it shows all the GPUs of its request.

## Phase 2: End to end and burn-in

> - **Modules:** M4, M6
> - **Runbook:** N3; procedures L1 and L3

- [ ] **NCCL tests pass at each scope.**
  Run: `all_reduce_perf`, `all_gather_perf`, and `alltoall_perf`, in this sequence:
  1. one node;
  2. node pairs: this is the **bisection search for a bad link or a bad node**;
  3. each leaf switch or each rail group;
  4. the full cluster.

  Pass: at each scope, the bus bandwidth agrees with the expected number of Phase 0.
  Why: one bad link slows the full job.
- [ ] **The sustained compute is stable.**
  Run: HPL or HPL-MxP, for example from the NVIDIA HPC Benchmarks container.
  Pass: the result agrees with the expected number,
  and no GPU throttles.
- [ ] **The burn-in soak passes.**
  Run: a load for 24 to 72 h.
  Then do the counter checks of Phase 1 again:
  Xid, ECC, NVLink, InfiniBand, and RoCE.
  Why: many marginal optics fail only when they are warm.
- [ ] **The node verdict is `PASS` after the soak.**
  Run: `health-validation run --execution-context OPERATOR_INFRA --cadence MAINTENANCE` on each node,
  or read the verdict that the site already collects.
  Pass: `overall_severity` is `PASS` or `INFO`; every `UNKNOWN` names the check that could not run and why.
  Why: the soak is the moment when a marginal GPU or link shows itself;
  the verdict turns the reading into a pass or a quarantine with a reason.
- [ ] **A reference training job reaches the expected throughput.**
  Run: for example an MLPerf Training workload,
  or the reference job of the customer (M11).
  Record the step time and the tokens per second as the baseline.

## Phase 3: Ready for on-call

These items make the cluster operable.
The acceptance tests do not include them.

- [ ] **The telemetry is complete** (M5).
  The dashboards show `dcgm-exporter` and the node exporter from every node,
  the fabric telemetry (UFM or the switches),
  and the storage telemetry.
- [ ] **The alerts reach the on-call team.**
  Send one test alert on each route,
  and confirm that it arrives.
- [ ] **The baselines are in the runbooks.**
  Write the measured numbers of Phase 1 and Phase 2
  in the section "Hardware variants" of each runbook.
  Why: thresholds do not transfer between hardware types
  ([hardware-matrix.md](hardware-matrix.md#what-changes-for-on-call), rule 5).
- [ ] **The per-job health gates run.**
  `dcgmi diag -r 1` in the Slurm epilog,
  or a node readiness gate on Kubernetes
  (M10 lab, step 4;
  [H10b](../handson/10-advanced-guides/nvsentinel.md) for NVSentinel).
- [ ] **The scheduled active tests run.**
  One command starts the test suite at node, rack, or multi-rack scale.
  A node or rack that is slower than its peers goes to a test reservation (the quarantined state), not back into production.
  Why: large operators replace the one-time acceptance test with continuous tests
  (NVIDIA at @Scale, [Experience Productionizing and Operating GB200 Cluster](https://www.youtube.com/watch?v=1o4emwSid78), from 14:00).
- [ ] **The node state machine is in operation.**
  Each state has its label or taint,
  and its entry and exit criteria (M10).
- [ ] **The automation has guardrails:**
  the allow-list of automated actions,
  and a blast-radius cap on automatic drains (runbook P5).
- [ ] **The management planes have a tested backup:**
  the backup matrix,
  and one restore drill with a measured RTO (procedure L15).
- [ ] **The tenants are onboarded:**
  procedure L16 for each tenant, with the audit check
  (M9).
- [ ] **The change and drift processes run:**
  the change procedure (L7),
  the scheduled drift check against the Phase 0 baseline (L22),
  and the vendor advisory review (L21).
- [ ] **The RMA path works:**
  one practice evidence package (L2),
  and one practice vendor case (L8, L12).
- [ ] **The first runbooks exist:**
  at minimum, the five of [Write these five first](runbook-catalog.md#write-these-five-first).
- [ ] **Hypercare starts:**
  the daily health check
  (L17, [shift-discipline.md](shift-discipline.md#7-the-daily-health-check-procedure-l17))
  and the shift handover (L6).

## Sign-off

The cluster goes into production when all these conditions are true:

1. Every node, link, and port passed Phase 1 and Phase 2,
   or it is out of service with a defect and an owner.
2. No open defect has a severity that stops the handover.
3. The baselines are in the runbooks.
4. The evidence package is in the agreed location:
   the acceptance report, the output files, the version inventory, and the as-built record.
5. Each Phase 3 item is done,
   or it has an owner and a date.

The integration lead and the SRE lead sign the checklist.

## What passes without acceptance checks

These faults cause no alert.
Only an active check finds them.

| Fault | Why no alert | The check that finds it |
|-------|--------------|-------------------------|
| A miswired cable that links up | The link is up and has no errors; the routes and the load are wrong | Topology compare: `ibdiagnet` (section 5), LLDP (section 6) |
| A link that trained at a low speed or width, PCIe or fabric | The link operates, but slowly | `lspci -vv` (section 2), `iblinkinfo` and `ibdiagnet` (section 5) |
| An optic with a high raw BER | FEC corrects the errors until the optic fails | `mlxlink` and the BER of `ibdiagnet` (section 5) |
| A firmware mismatch between switches and HCAs, or between nodes | Each part operates alone | The version compare (section 2), the drift check L22 |
| A wrong lossless Ethernet setting | It shows only at scale, under load | The PFC and ECN configuration, and the counters under traffic (section 6) |
| One slow GPU or NIC | Every health check passes | The compare with the other GPUs (section 3); the NCCL node pairs (Phase 2) |

## The checks that each stack gives you

| Stack | Gives you | You write and schedule |
|-------|-----------|------------------------|
| NVIDIA Base Command Manager or Mission Control | A health-check framework, burn-in, and node health gates; the checks that are on by default change with the version and the integrator | Confirm which checks are on; add the missing layers |
| Kubernetes through Rafay, with the GPU Operator and the Network Operator | The driver, the device plugin, `dcgm-exporter`, and the node labels | The acceptance suite of this page, the per-job gates, and the drain automation (NVSentinel or your own) |
| Slurm | `HealthCheckProgram`, the prolog, and the epilog; no checks by default | The scripts, for example with the LBNL Node Health Check and `dcgmi diag -r 1` |
| A cloud-managed cluster | The provider's acceptance and node health checks | Ask for the report and the check list; run Phase 2 yourself before the first customer job |

## For the managed-service cluster (Dell, UFM, self-hosted Rafay)

These items come from the "For this cluster" blocks of the modules.
The cluster arrives in two phases:
do this checklist in the acceptance window of each phase.

- [ ] **Dell iDRAC.**
  Read the sensors and the system event log through Redfish or `racadm`.
  Do one SupportAssist collection (`racadm techsupreport collect`),
  so that the RMA evidence path works
  (M1, lab for this cluster).
- [ ] **Dell firmware.**
  Pass: the compliance report of OpenManage Enterprise agrees with the baseline
  (M10, lab for this cluster, step 6).
- [ ] **HGX B300.**
  Pass: Fabric Manager and NVLSM are active on each server
  (M1, lab for this cluster, step 4).
- [ ] **UFM.**
  Run: `ufm_ha_cluster status` *(check the flags)*.
  Pass: the active and the standby unit are known and healthy,
  and the last configuration backup is in its location
  (M3, lab for this cluster).
- [ ] **Storage leaf switches.**
  Run: `nv show qos roce` *(check the command)*.
  Pass: the RoCE QoS state agrees with the design,
  and the PFC and ECN counters of the storage ports do not increase.
- [ ] **Self-hosted Rafay Controller.**
  Run: `kubectl get backups -n velero`.
  Pass: a recent backup exists,
  and a restore drill on a test controller has a measured RTO
  (M10, lab for this cluster).
- [ ] **Tenants.**
  Pass: the customer tenants, the tenants with no GPU, and the UAT tenant are onboarded with procedure L16
  (M9, lab for this cluster).

## Practice before the acceptance window

The window is short.
Learn the tools before it opens:

1. The No-HW lab of M3:
   find the defective links in a supplied `ibdiagnet` output.
2. The lab of M4:
   the expected bus bandwidth and the bisection search.
3. The T0 units [H00](../handson/00-orientation/README.md),
   [H11](../handson/11-dcgm-nvlink-fabric/README.md),
   and [H12](../handson/12-infiniband-fabric/README.md).
4. The ibsim labs [IB07](../handson/13-ibsim-real-fabric/lab07/README.md),
   [IB10](../handson/13-ibsim-real-fabric/lab10/README.md),
   [IB17](../handson/13-ibsim-real-fabric/lab17/README.md),
   and [IB18](../handson/13-ibsim-real-fabric/lab18/README.md).
5. The tier of each lab, and why the acceptance window is the best T3 lab:
   learning-hardware.md.
