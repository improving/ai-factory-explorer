# Command Reference

**Use:** the commands that a trainee must know by the end of the training, by layer of the layer model.
Each row says what the command shows and when to run it. The module column says where the lab uses it.

Rule: a command with flags in this file was used in a lab or confirmed on a vendor page.
A command marked *(check the flags)* is standard, but its exact options depend on your version; run `--help` first.
Commands that change state are in the last section, with the safety rule for each one.

## The first 5 minutes

**"The job is slow":**
1. `nvidia-smi` on one node of the job: is every GPU present, and is any one throttled or at a low clock?
2. Per-rank step time from the job logs: is one rank slower than the rest (a straggler), or all of them?
3. `perfquery -x` and `iblinkinfo` on the nodes of the slow rank: symbol errors, link down, link speed.
4. The DCGM profiling metrics (SM activity, not "GPU utilization") on the dashboard: saw-tooth = data or storage stall.
5. `all_reduce_perf` on the node pair of the slow rank against the acceptance threshold.

**"The job is hung":**
1. `py-spy dump --pid <pid>` on one rank: where is it blocked (an NCCL call, a data read, a file write)?
2. `dmesg -T | grep -i xid` on every node of the job: a Xid event in the last hour?
3. The PyTorch Flight Recorder dump: which rank did not enter the collective?
4. `nvidia-smi` on that rank's node: is the GPU present?
5. `iblinkinfo` and the subnet manager log for that node: a link flap in the last hour?

Then open the runbook: the table "Where do I start?" of [runbooks/README.md](../runbooks/README.md) names it for "slow", "hung", and the other symptoms.

## Node hardware

| Command | Shows | Run it when | Module |
|---------|-------|-------------|--------|
| `nvidia-smi` | GPU list, temperature, power, memory use, the processes | First on every GPU alert | M1 |
| `nvidia-smi -q` | The full state of every GPU: clocks, throttle reasons, ECC mode, driver version | A GPU is slow or hot | M1 |
| `nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE` | ECC error counts, row remap state (pending, failed), throttle reasons | Xid 48, 63, 64, 94, 95; before an RMA decision | M2 |
| `nvidia-smi topo -m` | The GPU-to-GPU and GPU-to-NIC path matrix (NV#, PIX, PXB, PHB, NODE, SYS) | NCCL selects a slow transport; a new node in acceptance | M1 |
| `nvidia-smi nvlink -s` *(check the flags)* | NVLink state and error counters for each link | Xid 74, 149; DCGM NVLink counter growth | M2 |
| `lspci -vv -s <bdf> \| grep -E 'LnkCap\|LnkSta'` *(check the flags)* | The maximum and the trained speed and width of one PCIe link | Acceptance of a new node; a GPU or NIC is slow with no error | M1 |
| `lspci -tv` | The PCIe tree: which GPU, NIC, and NVMe hang off which switch | A GPU "fell off the bus" (Xid 79); PCIe AER events | M1 |
| `nvidia-smi nvlink -e` *(check the flags)* | The NVLink error counters: CRC, replay, recovery | Acceptance, before and after the burn-in; Xid 74, 149 | M2 |
| `nvbandwidth` *(check the flags)* | The GPU-to-GPU and host-to-GPU bandwidth, against the expected number | Acceptance of a new node or rack; a suspected NVLink fault | M2 |
| `lstopo` | NUMA nodes, cores, and the devices on each one | GPU-to-NIC affinity; dataloader CPU placement | M1 |
| `ipmitool sensor` | BMC sensors: temperatures, fans, voltages, power | Thermal or power alarm; a node that does not boot | M1 |
| `ipmitool sel list` *(check the flags)* | The BMC system event log | A node reboot with no kernel log; a hardware fault | M1 |
| `dmesg -T` | The kernel log with timestamps: Xid, PCIe AER, NVMe, `amdgpu` messages | Every hardware alert; `grep -iE 'xid\|aer\|nvme'` | M2 |
| `nvme list`, `nvme smart-log /dev/nvme0` | The local NVMe drives and their health (media errors, wear) | Local NVMe failure or a slow local cache | M8 |

## Node software and GPU health

| Command | Shows | Run it when | Module |
|---------|-------|-------------|--------|
| `dcgmi health -c` *(check the flags)* | The DCGM health watch result for each GPU | Before you return a node to service | M2 |
| `dcgmi diag -r 1` | Quick diagnostics, seconds | Between jobs (the epilog); a suspect node | M2 |
| `dcgmi diag -r 3` | Long diagnostics, approximately 15 min; stresses the GPUs | After a repair; before a return to service. Drain the node first | M2 |
| `dcgmi diag -r 4` | Extended hardware diagnostics; stresses the GPUs for longer | Acceptance of a new node; a suspected silent defect. Drain the node first | M2 |
| `dcgmi dmon --list` | The DCGM field identifiers that you can watch | You write a new alert rule or a custom metric | M5 |
| `nvidia-bug-report.sh` | The full evidence bundle for NVIDIA support | Every RMA case; every unexplained Xid | M2 |
| `nvidia-imex-ctl` *(check the flags)* | The state of the IMEX daemon and its connections on an NVL72 compute tray | A multi-node NVLink job cannot start; Fabric Manager or IMEX alert | M9 |
| `systemctl status nvidia-fabricmanager` | Fabric Manager service state | CUDA initialization fails on an NVSwitch system | M2 |
| `amd-smi list` | The AMD GPUs that the driver sees | First on every AMD GPU alert | M2 |
| `amd-smi metric` | Power, temperature, clocks, memory, activity for each AMD GPU | An AMD GPU is slow or hot | M2 |
| `amd-smi metric --ecc` | ECC error counts, total and for each block | RAS `ue` or `ce` counter growth | M2 |
| `amd-smi ras` | The decoded RAS (CPER) entries from the kernel driver | The AMD equivalent of a Xid event | M2 |
| `amd-smi bad-pages` | The retired VRAM pages | Before an AMD RMA decision | M2 |
| `amd-smi xgmi`, `amd-smi topology` | The Infinity Fabric links and the GPU topology | An AMD collective is slow | M4 |
| `amd-smi firmware`, `amd-smi version` | Firmware and ROCm versions | An upgrade check against the ROCm compatibility matrix | M10 |
| `cat /sys/class/drm/card*/device/ras/*_err_count` | The RAS error counters for each hardware block | An alert rule on AMD RAS counters | M5 |

## Compute fabric

| Command | Shows | Run it when | Module |
|---------|-------|-------------|--------|
| `ibstat` | The local HCA ports: state, rate, LID | A node lost the fabric; a port is down | M3 |
| `iblinkinfo` | Every link of the fabric with its speed and width | A link runs below its rate; a link flap | M3 |
| `ibnetdiscover` | The fabric topology: which port connects to which switch | Port-map validation against the LLD; a cable moved | M3 |
| `perfquery -x` | The extended port counters: symbol errors, link downed, receive errors, discards | A slow link; before you blame a cable | M3 |
| `ibdiagnet` | A full fabric scan with an error report | The first command on a fabric-wide problem; weekly | M3 |
| `mlxlink -d <device> -p <port>` *(check the flags)* | The physical link: speed, bit error rate, optical power and temperature | A cable or transceiver fault | M3 |
| `perfquery -R`, `ibdiagnet --pc` *(check the flags)* | Clear the port counters | After the bring-up, before the traffic test of the acceptance | M3 |
| `lldpctl` on the host; `nv show interface <port> lldp` on Cumulus Linux *(check the flags)* | The LLDP neighbour of each Ethernet port | Cabling check against the port map on a RoCE fabric | M3 |
| `ib_write_bw`, `ib_write_lat` (between two nodes) | RDMA bandwidth and latency without NCCL | Separate a fabric fault from a NCCL fault | M3 |
| `ethtool -S <nic>` | NIC counters; on RoCE, the PFC pause and ECN counters | RoCE congestion; PFC storm; packet drops | M3 |
| `ethtool <nic>` | Link speed and state of an Ethernet NIC | A NIC negotiated a lower speed | M3 |
| `lsmod \| grep -E 'nvidia_peermem\|ib_core'` | Whether GPUDirect RDMA support is loaded | NCCL falls back to the host memory path | M4 |

## Collectives

| Command | Shows | Run it when | Module |
|---------|-------|-------------|--------|
| `NCCL_DEBUG=INFO all_reduce_perf -b 8 -e 8G -f 2 -g <gpus>` *(check the flags)* | The topology NCCL found, the transport it selected, and the bus bandwidth by message size | Acceptance of a node; a slow job; after a fabric repair | M4 |
| `mpirun -np <n> -H <hosts> all_reduce_perf ...` *(check the flags)* | The same across nodes | The bisection search for a defective node pair | M4 |
| `NCCL_DEBUG=INFO`, `NCCL_DEBUG_SUBSYS=INIT,NET` | The NCCL log detail; the second one limits it to init and network | A job that hangs at start; a wrong NIC selected | M4 |
| `rccl-tests` `all_reduce_perf` | The same on AMD Instinct | Acceptance of an AMD node | M4 |
| `py-spy dump --pid <pid>` | The Python stack of a live process without a stop | A hung rank; which call it waits in | M11 |
| The PyTorch Flight Recorder dump (`TORCH_NCCL_TRACE_BUFFER_SIZE`, then the dump file) *(check the variables)* | The collective calls of each rank and which rank did not enter | An NCCL watchdog timeout | M11 |

## Storage (VAST Data)

| Command | Shows | Run it when | Module |
|---------|-------|-------------|--------|
| `mount -o vers=3,nconnect=<n>,spread_reads,spread_writes,remoteports=dns,localports=<ip range> <vip>:/<export> /mnt/vast` | A VAST mount with multipath; `nconnect` = 8 for each 100 Gb/s on TCP, 2 for each 100 Gb/s on RDMA (minimum 8) | A client with low throughput; the M8 lab | M8 |
| `nfsstat -m` | The mount options in use on every NFS mount | The client does not use the multipath options | M8 |
| `fio` (sequential and random, `--ioengine=libaio --direct=1`) *(check the flags)* | Bandwidth and latency of a mount or a local NVMe | Separate a storage fault from a dataloader fault | M8 |
| `gdscheck -p` *(check the flags)* | The GPUDirect Storage support and configuration of the node | Acceptance of a node that uses GPUDirect Storage | M8 |
| `mdtest`, `elbencho` | Metadata operations for each second; a unified file and object benchmark | A metadata storm; the checkpoint write rate | M8 |
| `vperfcheck` (VAST, built on `elbencho`) | A baseline of the network and storage path from one client | Before a VAST performance ticket | M8 |
| `iostat -x 1` | Device utilization, queue depth, and service time | A slow local disk or a saturated mount | M8 |
| `biolatency` (bcc) | A histogram of block I/O latency | Tail latency that `iostat` averages away | M8 |
| `vastpy-cli --json get clusters` | The cluster state from VMS | The first VAST command in an incident | M8 |
| `vastpy-cli get vippools`, `vastpy-cli get views` *(check the resource names)* | The VIP pools and the views | Which CNodes serve a client; a quota question | M8 |
| VAST CLI: `vms list`, `vms modify --preferred-cnode-ids <id>` | Where VMS runs; move it to a different CNode | VMS is not available | M8 |
| VAST CLI: `supportbundle create --prefix <name> --preset <preset>` | A support bundle (presets: Standard, Performance, NFS, HW, RCA, and others) | Evidence for VAST support | M8 |

## Platform (Kubernetes through Rafay, Slurm)

| Command | Shows | Run it when | Module |
|---------|-------|-------------|--------|
| `kubectl get nodes -o wide` | Node state (`Ready`, `NotReady`), version, IP | A node alert from Rafay | M9 |
| `kubectl describe node <node>` | Allocatable `nvidia.com/gpu` or `amd.com/gpu`, taints, conditions, the events | A pod cannot get a GPU; a taint from Node Problem Detector | M9 |
| `kubectl get pods -n gpu-operator` *(namespace as installed)* | The GPU Operator components: driver, toolkit, device plugin, DCGM exporter | A pod is `Running` but has no GPU | M9 |
| `kubectl logs -n gpu-operator <driver pod>` | The driver container log | The driver pod is in a crash loop after an upgrade | M9 |
| `kubectl describe pod <pod>` | The events: scheduling, `ContainerCreating`, device claims | A pod stuck in `Pending` or `ContainerCreating` | M9 |
| `kubectl get computedomains,resourceclaims -A` *(check the resource names)* | The ComputeDomain objects and the IMEX channel claims on NVL72 | A multi-node NVLink job cannot start | M9 |
| `kubectl get workloads -A` (Kueue) *(check the resource name)* | The queued jobs and why they wait | A gang job stays in the queue | M9 |
| `kubectl get pvc -A` | The PersistentVolumeClaims and their state | A claim stays in `Pending` (VAST CSI) | M8 |
| `rctl` *(check the subcommands)* | The Rafay CLI: clusters, blueprints, projects | A scripted check of the blueprint version on every cluster | M9 |
| `rcollect` (self-hosted Rafay Controller) | The support logs of the controller | The controller is degraded | M10 |
| `sinfo -R` | The Slurm nodes that are down or drained, with the reason | A Slurm node alert | M10 |
| `scontrol show node <node>` | The full Slurm state of a node, GRES included | A job cannot get a GPU on Slurm | M10 |
| `squeue`, `sacct -j <job>` | The queue; the accounting record of a job | A job did not start, or failed | M10 |

### Scheduler policy (KAI Scheduler, NVIDIA Run:ai)

| Command | Shows | Run it when | Module |
|---------|-------|-------------|--------|
| `kubectl get queue` and `kubectl get queue <name> -o yaml` | The quota, the limit, the over-quota weight, the priority, and the allocated value | A job waits, and the cluster has free GPUs | M9 |
| `kubectl get podgroups -o wide`; `kubectl describe podgroup <name>` | The `minMember` and the condition of the gang | The free GPUs are scattered across nodes | M9 |
| `kubectl get topology` and `kubectl get nodes -L <level-label>` | The topology levels and the free capacity in each domain | A required placement cannot be met | M9 |
| `kubectl get pod <pod> -o jsonpath='{.spec.schedulerName}'` | Whether KAI schedules the pod at all | A pod is pending with no queue event | M9 |
| `kubectl get bindrequests -A` *(KAI DRA)* | The binder requests, including an IMEX channel allocation | A DRA claim does not bind | M9 |
| `kubectl -n kai-scheduler port-forward deploy/queue-controller 8080:8080`, then `curl -s localhost:8080/metrics` | `queue_deserved_gpus`, `queue_allocated_gpus`, `queue_fair_share_gpu` | The queue panel disagrees with the queue object | M5 |
| `runai workload list` and `runai workload describe <name>` | The workload, its project, its GPUs, and its preemptibility | A customer says "our workload is preempted" | M9 |

### Host lifecycle (NICo)

| Command | Shows | Run it when | Module |
|---------|-------|-------------|--------|
| `nicocli machine list --all --output table` | The machines, their state, and their SKU | A host cannot be allocated | M10 |
| `nicocli machine get <id> -o json` | State, health, SKU validation, and the firmware inventory in one record | A platform ticket names a host | M10 |
| `nicocli instance list`; `nicocli instance delete <id>` | The instances of the tenant; the release path | A tenant releases a host, or a repair needs the host | M10 |
| `kubectl -n <nico-ns> get pods` | The site controller services | The lifecycle API does not answer | M10 |

## Observability

| Command | Shows | Run it when | Module |
|---------|-------|-------------|--------|
| `curl -s localhost:9400/metrics \| grep DCGM_FI` *(port as installed)* | The metrics that `dcgm-exporter` gives | A metric is missing from the dashboard | M5 |
| `curl -s localhost:9100/metrics` | The node exporter metrics | A host metric is missing | M5 |
| `journalctl -u nvidia-fabricmanager`, `journalctl -k` | The Fabric Manager log; the kernel log through journald | A Fabric Manager alert; a Xid search | M2 |
| `amtool` *(Alertmanager CLI; check the flags)* | The active alerts, silences, and the routing | An alert storm; a silence during a change | M5 |

## For the managed-service cluster (Dell, UFM, self-hosted Rafay)

These come from the "For this cluster" blocks of the modules.

| Command | Shows | Run it when | Module |
|---------|-------|-------------|--------|
| `chronyc tracking`, `chronyc sources` | The time offset of the node, and its NTP sources | TLS or token errors; a node `NotReady` with no other cause (runbook N10) | M3 |
| `racadm techsupreport collect`, then `racadm techsupreport export` *(check the flags)* | The Dell SupportAssist collection, the evidence for a Dell case | Every Dell RMA case (procedures L2, L12) | M1 |
| `ufm_ha_cluster status` *(check the flags)* | Which UFM unit is active, and the state of the pair | A UFM event; a subnet manager failover (runbook N7) | M3 |
| `nv show qos roce` *(check the command on your Cumulus Linux version)* | The RoCE QoS state of a storage leaf switch | Slow storage over RDMA; PFC or ECN counter growth | M3 |
| `kubectl get backups -n velero`, `kubectl describe backup -n velero <name>` | The Rafay Controller backups and their state | The daily health check (L17); before a controller upgrade | M10 |

## Commands that change state

Run these only inside a runbook step, with the blast radius written down first.

| Command | Does | Safety rule | Module |
|---------|------|-------------|--------|
| `nvidia-smi -r -i <gpu>` | Resets one GPU | No process on the GPU; not on a GPU that is part of a live NVLink domain job | M2 |
| `nvidia-smi -pl <watts> -i <gpu>` | Sets a power cap | Only as a mitigation for a thermal event; record it, and remove it after | M2 |
| `kubectl cordon <node>`, `kubectl drain <node> --ignore-daemonsets` | Stops new pods; moves the pods off | Check the ComputeDomain: on NVL72, one drain can stop a 72-GPU job | M10 |
| `kubectl uncordon <node>` | Returns a node to scheduling | Only after the return-to-service tests of the node state machine | M10 |
| `scontrol update NodeName=<node> State=DRAIN Reason="<ticket>"` | Drains a Slurm node | Always with the ticket number as the reason | M10 |
| `scontrol update NodeName=<node> State=RESUME` | Returns a Slurm node | Same rule as `uncordon` | M10 |
| `systemctl restart nvidia-fabricmanager` | Restarts Fabric Manager | Stops every CUDA context on the NVSwitch system; drain first | M2 |
| `vms modify --preferred-cnode-ids <id>` | Moves VMS | Management plane only; the data path stays up | M8 |
| A blueprint version change in Rafay | Rolls an add-on change to every cluster of the blueprint | Canary cluster first; drift mode "notify" during the roll | M10 |
| `nvfwupd` (DGX firmware) *(check the flags)* | Updates BMC, BIOS, GPU, or NIC firmware | Only through the change procedure L7; some components need an AC power cycle | M10 |
| A reboot, a power cycle through the BMC | Restarts the node | Only after a drain; never on a node in an active IMEX domain without the job owner | M10 |
| `ufm_versions_mgr backup` | Makes a UFM configuration backup, with no downtime | On a schedule (L15), and before a UFM change. In HA, the backup is on the active unit only; copy it after a failover | M3, M10 |
| `ufm_versions_mgr restore` *(use `--dry-run` first; check the flags)* | Restores UFM from a backup | Stops UFM during the restore; only in a change window | M10 |
| `etcdctl snapshot save <file>` | Makes an etcd snapshot | Before a control-plane change; the restore drill of M10 | M10 |
| `radm` *(on the controller nodes; check the subcommands for your release)* | Installs, upgrades, and restores a self-hosted Rafay Controller | L3 only, through the change procedure L7 or the restore runbook R8 | M9, M10 |
