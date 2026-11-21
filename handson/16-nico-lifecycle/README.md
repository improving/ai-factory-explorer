# H16 — NICo: the host lifecycle with mock hardware

**Why:** M10 asks each trainee to write the node state machine.
A state machine on paper is a guess.
This lab runs the real lifecycle on mock hosts: discovery, SKU validation, firmware baseline, maintenance, allocation, and release.
No server, no BMC, no DPU.

**Serves:** M10 (the lifecycle block), M7 (the state and the classification in a ticket).
**Cluster:** new `kind` cluster; the NICo local stack and Machine-a-Tron mock hosts.
**Time:** 90 minutes, plus about 20 minutes of unattended ingestion.

## Concepts

- **The host has a state before it has a software state.**
  NICo owns that state: discovered, validated, baseline, allocated, in use, sanitizing, available, quarantined, in repair.
  A ticket that says "the node is free but I cannot use it" is a state question, not a Kubernetes question.
- **The evidence at each gate.**
  Discovery (Redfish inventory), SKU validation (bill of materials), burn-in (single-node and multi-node tests), firmware baseline (UEFI and BMC versions), and attestation (PCR and TPM).
  A host that fails a gate is quarantined, and the reason is on the machine record.
- **The health classification is the decision.**
  `PreventAllocations` means that no instance can use the host, even when the host is powered and reachable.
  A maintenance flag adds three classifications automatically, so that the state-machine SLA does not page.
- **The release is a sequence, not a delete.**
  Secure erase, UEFI memory-overwrite check, InfiniBand reset, TPM clear, re-attestation, firmware check, then the network cleanup with a convergence gate.
  The host returns to the pool only after the DPU confirms that it left every tenant network.
- **Two repair paths.**
  Online repair keeps the instance assigned; full repair releases it and lets a repair tenant claim the machine.
  The choice is a customer decision, not a hardware decision.

## Prerequisites

| Requirement | Detail |
|---|---|
| `docker` with 8 GB or more for the daemon | `docker info` |
| `kind`, `kubectl`, `helm`, `devspace` | `kind version`, `kubectl version --client`, `helm version`, `devspace --version` |
| Disk | about 30 GB for the images and the local databases |
| Time | 20 to 30 minutes for the first build |

The stack builds every image inside Docker.
You do not need a Rust or Go toolchain for this path.

## Option A — run the stack

### Part A — bootstrap and deploy

```bash
git clone --branch v2.2.2 https://github.com/dsx-ai-factory/infra-controller.git
cd infra-controller

kind create cluster --name nico
dev/deployment/devspace/bootstrap-prereqs.sh
devspace deploy
```

The bootstrap installs cert-manager, PostgreSQL, Vault, Temporal, and Keycloak.
It is safe to re-run.
`devspace deploy` builds NICo Core, NICo REST, and Machine-a-Tron, then deploys them.

```bash
kubectl get pods -A | grep -E 'nico|machine-a-tron|temporal|keycloak'
```

**Expected:** the NICo pods reach `Running`.
The first build takes the longest.

Find the namespace and the REST endpoint that the deploy printed.
The rest of this lab uses `$NICO_NS` and `$NICO_API`.

```bash
export NICO_NS=<the namespace from the deploy output>
export NICO_API=<the REST base URL from the deploy output>
```

### Part B — read the fleet

Machine-a-Tron starts its mock hosts, and the site explorer ingests them.
This is unattended.

```bash
nicocli site list
nicocli machine list --all --output table | head -20
```

**Expected:** one site, and a growing list of machines.
The state moves from discovery to validation.

To watch the progress without the CLI, count the machines until the number stops changing:

```bash
watch -n 30 'nicocli machine list --all --output table | wc -l'
```

### Part C — SKU validation and health

Pick one machine and read its full record.

```bash
MACHINE_ID="$(nicocli machine list --all -o json | jq -r '.[0].id')"
nicocli machine get "$MACHINE_ID" -o json > machine.json
jq '{state, health, skuValidation, firmware}' machine.json
```

**Expected:** a state, a health report, a SKU result, and a firmware inventory.
Read each one against the Day 0 gates of M10.

Now break one gate.
The exact action names come from the CLI help, because the REST surface is generated from the OpenAPI spec.

```bash
nicocli machine --help
```

Find the action that sets a health override or a maintenance flag.
Apply it to the machine, then read the machine again.

```bash
jq '{state, health}' machine.json
```

**Expected:** the health report carries a classification, and `PreventAllocations` appears.
If the CLI has no override action on this version, use the REST API from the reference documentation.

### Part D — the allocation block

Try to create an instance on the machine that carries `PreventAllocations`.

```bash
nicocli instance create --help
nicocli tenant list
```

**Expected:** the request fails, and the error names the classification or the state.
This is the difference between "the host is down" and "the host is not allocatable".

Record the exact error text.
It is the sentence that P9 in the runbook catalogue starts from.

### Part E — release and sanitization

If the stack has a tenant and an instance from the default seed, release the instance.

```bash
nicocli instance list --output table
nicocli instance delete <instance-id>
nicocli machine get "$MACHINE_ID" -o json | jq '{state, health}'
```

**Expected:** the machine passes through the cleanup states and returns to the pool.
The release is not complete until the network cleanup converges.

If the stack has no instance, do Part E as a walkthrough:
read [Tenant Lifecycle Cleanup](https://github.com/dsx-ai-factory/infra-controller/blob/main/docs/operations/tenant-lifecycle-cleanup.md) and write the sequence, with the evidence of each step.

### Part F — map it to your site

Write your site's state machine with two columns: the NICo state, and the RFP state of M10 lab 5.

| NICo state | Your RFP state | The gate | The evidence |
|---|---|---|---|
| discovered | | | |
| validated | | | |
| baseline | | | |
| allocated | | | |
| in use | | | |
| sanitizing | | | |
| available | | | |
| quarantined | | | |
| in repair | | | |

Then list the steps that are manual at your site today: the BMC inventory, the firmware compare, the burn-in, the tenant network setup, the disk erase.
Name the first one to move, and why.

## Option B — walk through it without the stack

Read these four pages, and write the same table:

1. [Day 0, Day 1, and Day 2 Lifecycle](https://github.com/dsx-ai-factory/infra-controller/blob/main/docs/overview/lifecycle.md)
2. [Health Alert Classifications](https://github.com/dsx-ai-factory/infra-controller/blob/main/docs/architecture/health/health_alert_classifications.md)
3. [Repair Workflows](https://github.com/dsx-ai-factory/infra-controller/blob/main/docs/manuals/repair/overview.md)
4. [Tenant Lifecycle Cleanup](https://github.com/dsx-ai-factory/infra-controller/blob/main/docs/operations/tenant-lifecycle-cleanup.md)

Then answer the self-check from the pages alone.

## Troubleshooting

| Symptom | Cause | Check |
|---|---|---|
| `devspace deploy` fails on the image build | Docker memory below 8 GB, or no `linux/arm64` builder | `docker info`, then raise the memory of the Docker VM |
| No machines appear | The site explorer is still in its first sweep, or the mock hosts are not ready | `kubectl -n "$NICO_NS" logs deploy/nico-api`, the Machine-a-Tron pods |
| The REST call returns 401 | No token, or an expired token | `nicocli login`, then `nicocli user get` |
| The machine list is empty after 30 minutes | The DHCP pool is smaller than the fleet | the Machine-a-Tron sizing note in its deployment guide |

## Cleanup

```bash
devspace purge
kind delete cluster --name nico
```

## First run

This lab is new.
Record the exact output of each step in a copy of this file, and correct the commands that differ in your version.
The version that the plan pins is NICo v2.2.2.

## Self-check

A host is powered, reachable over Redfish, and has no tenant, but every instance request for it fails.
Name the three records that you read, in order, and the state or classification that each one can show.
(1. The machine record: state and health. 2. The health report: `PreventAllocations` and the probe id. 3. The SKU or baseline record: the gate that quarantined the host.)
Then answer: why is a released host not available until the DPU confirms the network cleanup?
