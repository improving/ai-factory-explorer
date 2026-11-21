#!/usr/bin/env bash
# Start a fresh ibsim container loaded with one topology file.
#
# Usage: scripts/start-sim.sh <topology-name> [container-name]
#   topology-name: a file under topologies/ without the .net extension, e.g. "simple", "two-switch"
#
# Env overrides: IBSIM_LAB_IMAGE, IBSIM_LAB_CONTAINER, IBSIM_LAB_TMUX_SESSION
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./common.sh
require_docker

TOPO="${1:?Usage: start-sim.sh <topology-name> [container-name]}"
IBSIM_LAB_CONTAINER="${2:-$IBSIM_LAB_CONTAINER}"

TOPO_FILE="${REPO_ROOT}/topologies/${TOPO}.net"
[ -f "$TOPO_FILE" ] || { echo "ERROR: no such topology file: $TOPO_FILE" >&2; exit 1; }

if container_running; then
    echo "ERROR: container '${IBSIM_LAB_CONTAINER}' is already running. Run scripts/stop-sim.sh first." >&2
    exit 1
fi
docker rm -f "${IBSIM_LAB_CONTAINER}" >/dev/null 2>&1 || true

echo ">>> Starting container '${IBSIM_LAB_CONTAINER}' from ${IBSIM_LAB_IMAGE} ..."
docker run -d --name "${IBSIM_LAB_CONTAINER}" \
    -v "${REPO_ROOT}/topologies:/lab/topologies:ro" \
    "${IBSIM_LAB_IMAGE}" >/dev/null

echo ">>> Launching 'ibsim -s topologies/${TOPO}.net' inside a tmux session named '${IBSIM_LAB_TMUX_SESSION}' ..."
docker exec "${IBSIM_LAB_CONTAINER}" tmux new-session -d -s "${IBSIM_LAB_TMUX_SESSION}" -x 220 -y 50 \
    "ibsim -s /lab/topologies/${TOPO}.net 2>&1 | tee /lab/ibsim.log"

sleep 1
echo ">>> ibsim console (first lines):"
docker exec "${IBSIM_LAB_CONTAINER}" tmux capture-pane -t "${IBSIM_LAB_TMUX_SESSION}" -p | sed '/^$/d' | tail -10

cat <<EOF

Container '${IBSIM_LAB_CONTAINER}' is running ibsim on topology '${TOPO}'.

Next:
  scripts/discover.sh              # run ibnetdiscover against it
  scripts/start-opensm.sh          # start the Subnet Manager
  docker exec -it ${IBSIM_LAB_CONTAINER} tmux attach -t ${IBSIM_LAB_TMUX_SESSION}   # watch/drive the ibsim console live
  scripts/stop-sim.sh              # tear it down
EOF
