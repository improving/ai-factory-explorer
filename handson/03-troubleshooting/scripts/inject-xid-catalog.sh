#!/usr/bin/env bash
# Injects 4 different real-world Xid codes onto 4 different GPU indices of the
# SAME nvml-mock pod, each paired with the nvml-mock-ctl failure mode that best
# approximates its real-hardware behaviour. Used for Drill 7's classification
# exercise in handson/03-troubleshooting/README.md.
#
# Uses GPU indices 0-3, which every multi-GPU profile has (the class profile b300 has 8).
# Requires: nodeAgent.kernelLog.enabled=true if you want these on `dmesg` too
# (see H02, step 5) — the NVML event set works either way.
#
# Usage:
#   ./inject-xid-catalog.sh [namespace]
set -euo pipefail

NAMESPACE="${1:-mokka}"
POD=$(kubectl -n "$NAMESPACE" get pod -l app.kubernetes.io/name=nvml-mock \
  -o jsonpath='{.items[*].metadata.name}')
POD="${POD%% *}"
if [[ -z "$POD" ]]; then
  echo "No nvml-mock pod found in namespace ${NAMESPACE}" >&2
  exit 1
fi

echo "Using pod: $POD (namespace: $NAMESPACE)"
echo

inject() {
  local gpu="$1" mode="$2" xid="$3" label="$4"
  echo "GPU ${gpu}: --mode ${mode} --xid ${xid}   (${label})"
  kubectl -n "$NAMESPACE" exec "$POD" -- nvml-mock-ctl fail --gpu "$gpu" --mode "$mode" --xid "$xid"
}

# gpu  mode                 xid  real-world label (see README.md Drill 7 table for the full explanation)
inject 0 ecc_uncorrectable   48  "Double Bit ECC Error"
inject 1 fallen_off_bus      79  "GPU has fallen off the bus"
inject 2 ecc_uncorrectable   64  "Row-remapping failure"
inject 3 lost                95  "Uncontained ECC error"

echo
echo "Done. Now work the classification drill in README.md Drill 7:"
echo "  kubectl -n ${NAMESPACE} exec ${POD} -- nvidia-smi --query-gpu=index,temperature.gpu,ecc.errors.uncorrected.aggregate.total --format=csv"
echo "  kubectl -n ${NAMESPACE} exec ${POD} -- dmesg | grep Xid || true   # needs nodeAgent.kernelLog.enabled=true"
echo
echo "Reset the devices when you're done:"
echo "  kubectl -n ${NAMESPACE} exec ${POD} -- nvml-mock-ctl reset"
