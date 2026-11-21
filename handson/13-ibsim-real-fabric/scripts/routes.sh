#!/usr/bin/env bash
# Dump a switch's unicast forwarding table.
# Usage: scripts/routes.sh <switch-lid-or-name-or--G-guid...>
# Examples:
#   scripts/routes.sh 1              # by LID
#   scripts/routes.sh -G 0x200000    # by GUID
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./common.sh
require_docker
require_container
[ $# -ge 1 ] || { echo "Usage: routes.sh <switch-lid | -G <guid>>" >&2; exit 1; }
dexec "ibroute $*"
