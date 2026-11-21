#!/usr/bin/env bash
# Full reset: remove the lab container, even if it has already stopped.
# Use this between labs to guarantee a known-clean starting state.
#
# Usage: scripts/reset.sh [container-name]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./common.sh
require_docker
IBSIM_LAB_CONTAINER="${1:-$IBSIM_LAB_CONTAINER}"

docker rm -f "${IBSIM_LAB_CONTAINER}" >/dev/null 2>&1 || true
echo ">>> Container '${IBSIM_LAB_CONTAINER}' removed (if it existed)."
echo ">>> Lab is back to a clean state. Start again with scripts/start-sim.sh <topology>."
