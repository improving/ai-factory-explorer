#!/usr/bin/env bash
# INSTRUCTOR-SIDE SCRIPT -- creates the broken state for lab 20. If you're the learner, run it but don't
# read it until you've worked the lab from its symptoms alone: the commands below show the faults.
# lab20/solution.md explains the faults and the fix.
#
# Usage: lab20/setup-broken-state.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source scripts/common.sh
require_docker

./scripts/start-sim.sh capstone

docker exec "${IBSIM_LAB_CONTAINER}" mkdir -p /etc/opensm
docker exec "${IBSIM_LAB_CONTAINER}" bash -c 'cat > /etc/opensm/partitions.conf << "EOF"
Default=0x7fff, ipoib, sl=0, defmember=full : ALL, ALL_SWITCHES=full;
Isolated=0x0020, sl=0, defmember=limited : 0x000000000010000a;
EOF'

./scripts/start-opensm.sh
sleep 1

echo ">>> Applying fault 1 ..."
docker exec "${IBSIM_LAB_CONTAINER}" tmux send-keys -t "${IBSIM_LAB_TMUX_SESSION}" 'Unlink "Switch1"[3]' Enter
sleep 1

echo ">>> Applying fault 2 ..."
docker exec "${IBSIM_LAB_CONTAINER}" tmux send-keys -t "${IBSIM_LAB_TMUX_SESSION}" 'Error "Switch4"[1] 60 21' Enter
sleep 2

echo ">>> Broken state is live. Give the learner only: 'the fabric is misbehaving, investigate.'"
