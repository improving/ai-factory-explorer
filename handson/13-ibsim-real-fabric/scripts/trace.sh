#!/usr/bin/env bash
# Trace the path between two LIDs.
# Usage: scripts/trace.sh <from-lid> <to-lid>
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./common.sh
require_docker
require_container
[ $# -eq 2 ] || { echo "Usage: trace.sh <from-lid> <to-lid>" >&2; exit 1; }
dexec "ibtracert $1 $2"
