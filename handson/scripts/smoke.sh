#!/usr/bin/env bash
# Smoke-test the hands-on labs: the same checks run locally and in CI (.github/workflows/handson.yml).
#
# Usage: handson/scripts/smoke.sh [docs|mokka|ibsim|all]   (default: all)
#   docs   links under handson/, build-map.py, and the pinned-version copies agree
#   mokka  kind + the nvml-mock chart with profiles/b300.yaml: key commands of modules 00-03, 11, 12
#   ibsim  build the lab image, run setup/verify.sh, and the lab 10 and lab 20 flows
#
# It never touches a trainee's own cluster or container: it uses its own names and kubeconfig,
# and removes what it creates when it exits.
set -euo pipefail

HANDSON="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$HANDSON/.." && pwd)"

# The pinned versions come from handson/README.md, so the smoke test checks what the trainee installs.
MOKKA_VERSION="$(sed -n 's/^export MOKKA_VERSION=\([^ ]*\).*/\1/p' "$HANDSON/README.md")"
MOKKA_NODE_IMAGE="$(sed -n 's/^export MOKKA_NODE_IMAGE=\([^ ]*\).*/\1/p' "$HANDSON/README.md")"
FGO_VERSION="$(sed -n 's/^export FGO_VERSION=\([^ ]*\).*/\1/p' "$HANDSON/README.md")"
KAI_VERSION="$(sed -n 's/^export KAI_VERSION=\([^ ]*\).*/\1/p' "$HANDSON/README.md")"
NICO_VERSION="$(sed -n 's/^export NICO_VERSION=\([^ ]*\).*/\1/p' "$HANDSON/README.md")"
HEALTH_VALIDATION_VERSION="$(sed -n 's/^export HEALTH_VALIDATION_VERSION=\([^ ]*\).*/\1/p' "$HANDSON/README.md")"
RUNAI_VERSION="$(sed -n 's/^export RUNAI_VERSION=\([^ ]*\).*/\1/p' "$HANDSON/README.md")"
TOPOGRAPH_VERSION="$(sed -n 's/^export TOPOGRAPH_VERSION=\([^ ]*\).*/\1/p' "$HANDSON/README.md")"
DPF_VERSION="$(sed -n 's/^export DPF_VERSION=\([^ ]*\).*/\1/p' "$HANDSON/README.md")"
CHART=oci://ghcr.io/nvidia/k8s-test-infra/chart/nvml-mock
CLUSTER="${SMOKE_CLUSTER:-handson-smoke}"

FAILURES=0
pass() { echo "  ok   $*"; }
fail() { echo "  FAIL $*"; FAILURES=$((FAILURES + 1)); }
# expect <description> <expected> <actual>
expect() { if [[ "$2" == "$3" ]]; then pass "$1"; else fail "$1: expected '$2', got '$3'"; fi; }
# expect_min <description> <minimum> <actual>
expect_min() { if [[ "$3" =~ ^[0-9]+$ ]] && (( $3 >= $2 )); then pass "$1"; else fail "$1: expected at least '$2', got '$3'"; fi; }
# expect_match <description> <regex> <text>
expect_match() { if grep -qE -- "$2" <<<"$3"; then pass "$1"; else fail "$1: no match for /$2/"; fi; }

smoke_docs() {
  echo "== docs"
  [[ -n "$MOKKA_VERSION" && -n "$MOKKA_NODE_IMAGE" ]] || { fail "pinned versions not found in handson/README.md"; return; }

  expect "FGO_VERSION is pinned in handson/README.md" 1 \
    "$(grep -c '^export FGO_VERSION=' "$HANDSON/README.md")"
  expect "KAI_VERSION is pinned in handson/README.md" 1 \
    "$(grep -c '^export KAI_VERSION=' "$HANDSON/README.md")"
  expect "H14 pins the KAI chart version" 1 \
    "$(grep -c -- '--version "$KAI_VERSION"' "$HANDSON/14-kai-scheduler/README.md")"
  expect "HEALTH_VALIDATION_VERSION is pinned in handson/README.md" 1 \
    "$(grep -c '^export HEALTH_VALIDATION_VERSION=' "$HANDSON/README.md")"
  expect "H18 clones the health-validation tag" 1 \
    "$(grep -c "git clone --branch ${HEALTH_VALIDATION_VERSION}" "$HANDSON/18-health-validation/README.md")"
  expect "H15 clones the Run:ai release" 1 \
    "$(grep -c "git clone --branch ${RUNAI_VERSION}" "$HANDSON/15-runai-platform/README.md")"
  expect "H19 pins the topograph chart" 1 \
    "$(grep -c -- '--version "$TOPOGRAPH_VERSION"' "$HANDSON/19-topograph/README.md")"
  expect "H17 pins the DPF chart" 1 \
    "$(grep -c -- '--version "$DPF_VERSION"' "$HANDSON/17-dpf/README.md")"
  expect_min "H10c installs the FGO OCI chart with FGO_VERSION" 1 \
    "$(grep -c 'oci://ghcr.io/run-ai/fake-gpu-operator/fake-gpu-operator' "$HANDSON/10-advanced-guides/runai-fgo.md")"
  expect_min "H10c pins the FGO chart version" 1 \
    "$(grep -c -- '--version "${FGO_VERSION' "$HANDSON/10-advanced-guides/runai-fgo.md")"
  expect "H10c has no stale FGO Helm repository" 0 \
    "$(grep -c 'helm repo add fake-gpu-operator' "$HANDSON/10-advanced-guides/runai-fgo.md")"
  expect "H10c scopes FGO by the node pool label" 1 \
    "$(grep -c 'run.ai/simulated-gpu-node-pool: fgo' "$HANDSON/10-advanced-guides/runai-fgo.md")"

  local tag="${MOKKA_NODE_IMAGE##*:}"
  expect "kind-multi-node.yaml uses MOKKA_NODE_IMAGE" 3 \
    "$(grep -c "image: ${MOKKA_NODE_IMAGE}\$" "$HANDSON/02-runtime-control/manifests/kind-multi-node.yaml")"
  expect "fix-multiarch-image.sh defaults to MOKKA_VERSION" 1 \
    "$(grep -c "MOKKA_VERSION:-${MOKKA_VERSION}}" "$HANDSON/03-troubleshooting/scripts/fix-multiarch-image.sh")"
  expect_match "plan pins the node image" "mokka-kind-node:${tag}" "$(cat "$REPO/plan/learning-hardware.md")"
  expect_match "plan pins the chart" "--version ${MOKKA_VERSION} " "$(cat "$REPO/plan/learning-hardware.md")"
  expect_match "profiles/b300.yaml is derived from v${MOKKA_VERSION}" "Mokka v${MOKKA_VERSION} " "$(head -5 "$HANDSON/profiles/b300.yaml")"
  local clones unexpected
  clones="$(grep -rhoE 'git clone --branch v[0-9.]+' "$HANDSON" --include='*.md' | sort -u)"
  expect_match "the Mokka clone checks out v${MOKKA_VERSION}" "git clone --branch v${MOKKA_VERSION}" "$clones"
  expect_match "the NICo clone checks out ${NICO_VERSION}" "git clone --branch ${NICO_VERSION}" "$clones"
  unexpected="$(grep -vE "^git clone --branch v(${MOKKA_VERSION}|${NICO_VERSION#v})$" <<<"$clones" || true)"
  expect "every upstream clone uses a pinned version" "" "$unexpected"

  local broken
  broken="$(python3 - "$HANDSON" <<'EOF'
import pathlib, re, sys
def anchors(p):
    return {re.sub(r'[^\w\- ]', '', h.lower()).replace(' ', '-') for h in re.findall(r'^#+ (.+)$', p.read_text(), re.M)}
for p in pathlib.Path(sys.argv[1]).rglob('*.md'):
    for target, frag in re.findall(r'\]\(([^)#\s]+)(?:#([^)]*))?\)', p.read_text()):
        # skip URLs and ibnetdiscover port GUIDs such as "[1](100001)" in code blocks
        if target.startswith(('http', 'mailto:')) or re.fullmatch(r'[0-9a-f]+', target):
            continue
        t = p.parent / target
        if not t.exists() or (frag and t.is_file() and frag not in anchors(t)):
            print(f'{p}: {target}' + (f'#{frag}' if frag else ''))
EOF
)"
  expect "relative links and anchors under handson/ resolve" "" "$broken"
  [[ -z "$broken" ]] || echo "$broken" | sed 's/^/       /'

  if (cd "$REPO" && python3 scripts/build-map.py >/dev/null); then pass "build-map.py"; else fail "build-map.py"; fi
}

smoke_mokka() {
  echo "== mokka (chart ${MOKKA_VERSION}, ${MOKKA_NODE_IMAGE}, profiles/b300.yaml)"
  local kubeconfig
  kubeconfig="$(mktemp -d)/kubeconfig"
  export KUBECONFIG="$kubeconfig"
  trap 'kind delete cluster --name "$CLUSTER" --kubeconfig "$KUBECONFIG" >/dev/null 2>&1 || true' EXIT

  kind create cluster --name "$CLUSTER" --kubeconfig "$KUBECONFIG" --image "$MOKKA_NODE_IMAGE" --wait 120s >/dev/null 2>&1 \
    || { fail "kind create cluster"; return; }
  install_profile() {
    helm upgrade --install nvml-mock "$CHART" --version "$MOKKA_VERSION" \
      --namespace mokka --create-namespace "$@" --wait --timeout 300s >/dev/null
    kubectl -n mokka rollout status ds/nvml-mock --timeout=180s >/dev/null
    sleep 3
  }
  install_profile --set-file gpu.customConfig="$HANDSON/profiles/b300.yaml"
  local pod
  pod="$(kubectl -n mokka get pod -l app.kubernetes.io/name=nvml-mock -o jsonpath='{.items[0].metadata.name}')"
  k() { kubectl -n mokka exec "$pod" -- "$@"; }

  # H00
  expect "00: nvidia-smi -L lists 8 B300 GPUs" 8 "$(k nvidia-smi -L | grep -c 'NVIDIA B300 SXM6 AC')"
  expect_match "00: 288 GiB for each GPU" 'Total +: 294912 MiB' "$(k nvidia-smi -q -i 0)"
  # H02
  k nvml-mock-ctl temp --gpu 0 95 >/dev/null
  sleep 2
  expect "02: temp override reaches nvidia-smi" 95 "$(k nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader -i 0 | tr -d ' ')"
  k nvml-mock-ctl reset >/dev/null
  # H03
  if (cd "$HANDSON/03-troubleshooting" && bash scripts/inject-xid-catalog.sh >/dev/null); then
    pass "03: inject-xid-catalog.sh"
  else
    fail "03: inject-xid-catalog.sh"
  fi
  k nvml-mock-ctl reset >/dev/null
  # H11
  local topo
  topo="$(k nvidia-smi topo -m)"
  expect "11: topo -m shows NV18 for every GPU pair" 56 "$(grep -oE 'NV18' <<<"$topo" | wc -l | tr -d ' ')"
  expect_match "11: GPU4-GPU7 on NUMA node 1" 'GPU7.*64-127[[:space:]]+1' "$topo"
  expect_match "11: fabric is healthy" 'Summary +: Healthy' "$(k nvidia-smi -q -i 0)"
  k nvml-mock-ctl fabric-health --gpu 0 route_unhealthy >/dev/null
  sleep 2
  expect_match "11: fabric-health drill turns it unhealthy" 'Summary +: Unhealthy' "$(k nvidia-smi -q -i 0)"
  k nvml-mock-ctl fabric-health --gpu 0 healthy >/dev/null
  # H12, Part A
  local ib
  ib="$(k ibstat)"
  expect "12: ibstat lists 8 HCAs" 8 "$(grep -c "^CA '" <<<"$ib")"
  expect "12: every HCA runs at 800 Gb/s" 8 "$(grep -cE 'Rate: 800$' <<<"$ib")"
  # H01: switch to a100 and restore the class profile
  install_profile -f "$HANDSON/01-profiles-and-config/values/a100.yaml"
  pod="$(kubectl -n mokka get pod -l app.kubernetes.io/name=nvml-mock -o jsonpath='{.items[0].metadata.name}')"
  expect "01: a100 profile shows 8 A100 GPUs" 8 "$(k nvidia-smi -L | grep -c 'A100-SXM4-40GB')"
  install_profile --reuse-values --set-file gpu.customConfig="$HANDSON/profiles/b300.yaml"
  pod="$(kubectl -n mokka get pod -l app.kubernetes.io/name=nvml-mock -o jsonpath='{.items[0].metadata.name}')"
  expect "01: restore gives the B300 GPUs back" 8 "$(k nvidia-smi -L | grep -c 'NVIDIA B300 SXM6 AC')"
}

smoke_ibsim() {
  echo "== ibsim"
  export IBSIM_LAB_IMAGE="${IBSIM_LAB_IMAGE:-ibsim-lab:smoke}"
  export IBSIM_LAB_CONTAINER="${IBSIM_LAB_CONTAINER:-ibsim-smoke}"
  local lab="$HANDSON/13-ibsim-real-fabric"
  trap 'docker rm -f "$IBSIM_LAB_CONTAINER" >/dev/null 2>&1 || true' EXIT
  # shellcheck source=../13-ibsim-real-fabric/scripts/common.sh
  source "$lab/scripts/common.sh"
  nodes() { "$lab/scripts/discover.sh" -l 2>/dev/null | grep -cE '^(Ca|Switch)' || true; }

  "$lab/setup/install.sh" >/dev/null 2>&1 || { fail "setup/install.sh (docker build)"; return; }
  if "$lab/setup/verify.sh" >/dev/null 2>&1; then pass "setup/verify.sh"; else fail "setup/verify.sh"; fi

  # IB10: break the inter-switch link and bring it back
  "$lab/scripts/start-sim.sh" two-switch >/dev/null
  "$lab/scripts/start-opensm.sh" >/dev/null
  expect "lab10: baseline shows 6 nodes" 6 "$(nodes)"
  "$lab/scripts/inject-failure.sh" '"Switch1"[3]' >/dev/null
  sleep 2
  expect "lab10: Switch1 side only after Unlink" 3 "$(nodes)"
  "$lab/scripts/restore-link.sh" '"Switch1"[3]' >/dev/null
  sleep 2
  expect "lab10: all 6 nodes after ReLink" 6 "$(nodes)"
  local out
  out="$(mktemp -d)/diag"
  "$lab/scripts/collect-diagnostics.sh" "$out" >/dev/null
  expect "lab18: collect-diagnostics.sh writes 6 files" 6 "$(find "$out" -type f | wc -l | tr -d ' ')"
  "$lab/scripts/stop-sim.sh" >/dev/null

  # IB20: the broken state, then the fix from lab20/solution.md
  "$lab/lab20/setup-broken-state.sh" >/dev/null
  expect_match "lab20: Hca4 has the stray P_Key 0x0020" '0xffff 0x0020' "$(dexec 'smpquery pkeytable 8' 2>/dev/null | head -1)"
  sim_console 'ReLink "Switch1"[3]'
  sim_console 'Error "Switch4"[1] 0 21'
  docker exec "$IBSIM_LAB_CONTAINER" bash -c 'cat > /etc/opensm/partitions.conf << "EOF"
Default=0x7fff, ipoib, sl=0, defmember=full : ALL, ALL_SWITCHES=full;
EOF'
  "$lab/scripts/start-opensm.sh" >/dev/null
  sleep 2
  expect "lab20: all 8 nodes after the fix" 8 "$(nodes)"
  expect_match "lab20: Hca4 P_Key table matches the others" '0xffff 0x0000' "$(dexec 'smpquery pkeytable 8' 2>/dev/null | head -1)"
  "$lab/scripts/stop-sim.sh" >/dev/null
}

# Each part runs in a subshell, so its EXIT trap cleans up only what it created;
# its failure count (or 1 if a setup command failed) comes back as the exit code.
run_part() {
  local rc=0
  ( "$1"; exit "$FAILURES" ) || rc=$?
  FAILURES=$((FAILURES + rc))
}

case "${1:-all}" in
  docs) run_part smoke_docs ;;
  mokka) run_part smoke_mokka ;;
  ibsim) run_part smoke_ibsim ;;
  all) run_part smoke_docs; run_part smoke_mokka; run_part smoke_ibsim ;;
  *) echo "Usage: $0 [docs|mokka|ibsim|all]" >&2; exit 2 ;;
esac

echo
if [[ "$FAILURES" -eq 0 ]]; then echo "All smoke checks passed."; else echo "$FAILURES smoke check(s) failed."; exit 1; fi
