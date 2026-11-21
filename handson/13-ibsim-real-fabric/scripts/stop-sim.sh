#!/usr/bin/env bash
# Tear down the lab container (and everything running inside it: ibsim, opensm).
#
# Usage: scripts/stop-sim.sh [container-name]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./common.sh
require_docker

IBSIM_LAB_CONTAINER="${1:-$IBSIM_LAB_CONTAINER}"

if ! docker ps -a --format '{{.Names}}' | grep -qx "${IBSIM_LAB_CONTAINER}"; then
    echo "Container '${IBSIM_LAB_CONTAINER}' does not exist. Nothing to stop."
    exit 0
fi

echo ">>> Removing container '${IBSIM_LAB_CONTAINER}' ..."
docker rm -f "${IBSIM_LAB_CONTAINER}" >/dev/null
echo ">>> Stopped and removed."
