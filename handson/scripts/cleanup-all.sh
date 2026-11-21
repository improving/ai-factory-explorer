#!/usr/bin/env bash
# Deletes every kind cluster this session's modules can create, and uninstalls
# the Helm releases on the ones that don't get deleted outright (00-04, which
# reuse the "mokka" cluster rather than creating a throwaway one).
#
# Safe to run at any point: kind/helm no-op cleanly on a cluster/release that
# doesn't exist. Run with --dry-run to only print what would be deleted.
set -uo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

CLUSTERS=(
  # Not "mokka": H00-H04, H11, and H12 Part A reuse it, and it is the class cluster of
  # plan/learning-hardware.md. It is cleaned below, never deleted.
  mokka-multi                  # H02, Drill 9 (target-the-wrong-node)
  mokka-device-plugin          # H05
  mokka-fleet                  # H05 stretch goal
  mokka-dra                    # H06
  mokka-operator                # H07
  nvml-mock-failure-demo       # H08, BUILD_LOCAL=true path
  mokka-runai-fgo               # H10c
  mokka-ib                     # H12, Part B/C (multi-node IB fabric discovery)
  nvml-mock-node-wide-demo     # H09 (upstream demo script)
  nvml-mock-compute-domain     # H10a (upstream demo script)
  nvml-mock-nvsentinel         # H10b (upstream demo script)
)

run() {
  echo "+ $*"
  $DRY_RUN || "$@"
}

EXISTING=$(kind get clusters 2>/dev/null || true)

# --context / --kube-context leave the user's current kubectl context unchanged.
echo "== H11's dcgm-test pod and the nvml-mock release in the 'mokka' namespace =="
if grep -qx mokka <<<"$EXISTING"; then
  run kubectl --context kind-mokka -n mokka delete pod dcgm-test --ignore-not-found 2>/dev/null || true
  run helm --kube-context kind-mokka uninstall nvml-mock -n mokka 2>/dev/null || true
fi

echo
echo "== kind clusters =="
for c in "${CLUSTERS[@]}"; do
  if grep -qx "$c" <<<"$EXISTING"; then
    run kind delete cluster --name "$c"
  else
    echo "  (skip) $c not found"
  fi
done

echo
echo "Done. Remaining kind clusters:"
kind get clusters 2>/dev/null || echo "  (none, or kind is not installed)"
