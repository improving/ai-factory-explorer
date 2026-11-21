#!/usr/bin/env bash
# Restore a link previously broken with inject-failure.sh.
#
# Usage: scripts/restore-link.sh '"Switch1"[3]'
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./common.sh
require_docker
require_container
[ $# -eq 1 ] && [ -n "$1" ] || { echo 'Usage: restore-link.sh '"'"'"NodeId"[port]'"'"'' >&2; exit 1; }

echo ">>> Sending: ReLink $1"
sim_console "ReLink $1"
sleep 1
echo ">>> ibsim console output:"
sim_console_output | tail -20
