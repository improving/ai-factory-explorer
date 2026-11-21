#!/usr/bin/env bash
# Run ibnetdiscover against the fabric currently loaded in the lab container.
# Usage: scripts/discover.sh [extra ibnetdiscover flags...]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./common.sh
require_docker
require_container
dexec "ibnetdiscover $*"
