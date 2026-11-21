#!/usr/bin/env bash
# Resolve the nvml-mock DaemonSet pod running on a specific node.
#
# nvml-mock-ctl's scope is per-node: it only affects the node whose pod you
# exec into. This helper saves re-typing the field-selector every time.
#
# Usage:
#   ./find-node-pod.sh [node-name] [namespace]
#
# With no arguments, prints the pod on the first node kubectl returns
# (fine for single-node kind clusters). With a node name, targets that node.
set -euo pipefail

NAMESPACE="${2:-mokka}"
NODE="${1:-$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')}"

POD=$(kubectl -n "$NAMESPACE" get pod -l app.kubernetes.io/name=nvml-mock \
  --field-selector "spec.nodeName=${NODE}" -o jsonpath='{.items[*].metadata.name}')
POD="${POD%% *}"   # items[0] would fail under set -e on an empty list, before the check below

if [[ -z "$POD" ]]; then
  echo "No nvml-mock pod found on node ${NODE} in namespace ${NAMESPACE}" >&2
  exit 1
fi

echo "$POD"
