# State-changing safety checklist

Source: triage guide, "State-changing safety checklist (before any fix)". Inlined in every runbook's Mitigation section, where it gates both Mitigation and Repair. Update here first, then copy.

```
- Drain the node / job queue first: `kubectl drain --ignore-daemonsets` or `scontrol update ... State=DRAIN Reason="<ticket>"`.
- On NVL72, verify no active IMEX/ComputeDomain job: `kubectl get computedomains,resourceclaims -A`.
- Restarting `nvidia-fabricmanager` kills every CUDA context on the NVSwitch system.
- BIOS/firmware/BMC changes require a change window; some need AC power cycle.
- Switch fabric changes (`ufm_ha_cluster failover`, `nv config apply`) can drop RoCE/IB sessions.
```

Ticket rule: every action needs a ticket ID as the reason (Slurm `Reason="<ticket>"`, or the change record).

## Provenance tags used in all runbooks

| Tag | Meaning |
|-----|---------|
| `[C:L1]` … `[C:L8]`, `[C:§9]`, `[C:§10]`, `[C:§11.x]` | Command in the CLI gist (`handbook/cli_utilities_layered_gist.md`) at that layer or section |
| `[C:prose-state]` | State change the gist describes in prose but not in its §10 table |
| `[E]` | NCCL/MPI environment variable from the official NCCL documentation |
| `[X:nn]` | Command not in the gist, confirmed in vendor docs; row `Xnn` of the external command list (not in this repository; see `_sources/` in [_ledger/audit.py](../_ledger/audit.py)) |
| `[R]` | Command added in the integration review, confirmed in vendor documentation, not yet in the gist. Add it to the gist, then change the tag to `[C:…]` |
| `[GAP:Gnn]` | No confirmed command; action listed, no command text. Each runbook lists its gaps in "Appendix A — Gaps & open questions" |

## Shared procedure: drain and return to service (owned by RB-08)

1. Drain: `kubectl cordon`, then `kubectl drain --ignore-daemonsets` (K8s), or `scontrol update ... State=DRAIN Reason="<ticket>"` (Slurm).
   On NVL72 first run `kubectl get computedomains,resourceclaims -A` (K8s) or `nvidia-imex-ctl -H -N` (Slurm).
   The node is drained when Slurm shows `DRAINED` (not `DRAINING`), or when only DaemonSet pods are left.
2. Repair.
3. Test before returning (RB-08 section 9 has the full list):
   1. GPU: `dcgmi diag -r 3` (drained node only) and `dcgmi health -c`.
   2. Xid and ECC: `dmesg -T | grep -i xid` shows no new Xid; `nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE` shows no uncorrectable ECC error and no pending row remap.
   3. NCCL in one node: `NCCL_DEBUG=INFO all_reduce_perf -b 8 -e 8G -f 2 -g <gpus>` against the acceptance threshold (single node only).
   4. IB or NVL72 node: `ibstat` ports `Active`; `ib_write_bw` to a known-good node; a multi-node `mpirun -np <n> -H <hosts> all_reduce_perf ...` with a known-good node.
   5. NVL72 node: `nvidia-imex-ctl -H -N` all `READY`; `nvidia-smi nvlink -s` links up; `systemctl status nvidia-fabricmanager` active.
   6. Storage: `nfsstat -m` shows the VAST mount; a small write and read in a test directory.
   7. Kubernetes: `kubectl describe node <node>` shows the allocatable GPU and RDMA resources and the correct labels.
4. Return: read the drain reason first; do not resume a node that auto-remediation drained.
   Then `kubectl uncordon` or `scontrol update ... State=RESUME`, only after step 3 passes.
