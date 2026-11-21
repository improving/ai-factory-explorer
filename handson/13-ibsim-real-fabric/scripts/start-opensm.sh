#!/usr/bin/env bash
# Start OpenSM against the fabric currently loaded in the lab container.
#
# Usage: scripts/start-opensm.sh [container-name]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./common.sh
require_docker
IBSIM_LAB_CONTAINER="${1:-$IBSIM_LAB_CONTAINER}"
require_container

echo ">>> Starting OpenSM inside '${IBSIM_LAB_CONTAINER}' (log: /lab/opensm.log) ..."
docker exec "${IBSIM_LAB_CONTAINER}" bash -c '
    SO=$(find /usr/lib -iname "libumad2sim*.so" 2>/dev/null | head -1)
    pkill -9 opensm 2>/dev/null
    sleep 0.3
    LD_PRELOAD="$SO" nohup opensm -f /lab/opensm.log -B > /lab/opensm.out 2>&1 &
    disown
'
sleep 2
echo ">>> OpenSM state (tail of /lab/opensm.log):"
docker exec "${IBSIM_LAB_CONTAINER}" tail -n 15 /lab/opensm.log

cat <<'EOF'

Look for "Entering MASTER state" above -- that means OpenSM completed discovery, assigned LIDs, and
computed routes. If you don't see it yet, wait a couple seconds and re-run:
  docker exec <container> tail -f /lab/opensm.log
EOF
