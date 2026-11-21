#!/usr/bin/env bash
# Bring a link down via ibsim's console (genuinely flips the simulated port's physical/logical state --
# see CAPABILITIES.md). Uses tmux send-keys against the session started by start-sim.sh.
#
# Usage: scripts/inject-failure.sh '"Switch1"[3]'
#   (the argument is the ibsim console's nodeid[port] syntax -- keep the quotes, e.g. as a single
#    shell-quoted argument: inject-failure.sh '"Switch1"[3]')
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./common.sh
require_docker
require_container
[ $# -eq 1 ] && [ -n "$1" ] || { echo 'Usage: inject-failure.sh '"'"'"NodeId"[port]'"'"'' >&2; exit 1; }

echo ">>> Sending: Unlink $1"
sim_console "Unlink $1"
sleep 1
echo ">>> ibsim console output:"
sim_console_output | tail -20
