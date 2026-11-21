#!/usr/bin/env bash
# Bundle a diagnostics snapshot: ibnetdiscover, iblinkinfo, ibqueryerrors, and the opensm/ibsim logs.
# This is the "run this first when paged" habit IB18's runbook builds on.
#
# Usage: scripts/collect-diagnostics.sh [output-dir]
set -euo pipefail

# Resolve the output directory before the cd below, so a relative argument means the caller's
# directory and the default never lands inside the checkout.
OUTDIR="${1:-${TMPDIR:-/tmp}/ibsim-diagnostics-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$OUTDIR"
OUTDIR="$(cd "$OUTDIR" && pwd)"

cd "$(dirname "${BASH_SOURCE[0]}")"
source ./common.sh
require_docker
require_container

echo ">>> Collecting into $OUTDIR ..."
dexec "ibnetdiscover -f"        > "$OUTDIR/ibnetdiscover.txt"      2>&1 || true
dexec "iblinkinfo"                > "$OUTDIR/iblinkinfo.txt"          2>&1 || true
dexec "ibqueryerrors -rR"        > "$OUTDIR/ibqueryerrors.txt"      2>&1 || true
docker cp "${IBSIM_LAB_CONTAINER}:/lab/opensm.log" "$OUTDIR/opensm.log" 2>/dev/null || true
docker cp "${IBSIM_LAB_CONTAINER}:/lab/ibsim.log"   "$OUTDIR/ibsim.log"   2>/dev/null || true
sim_console_output > "$OUTDIR/ibsim-console.txt" 2>/dev/null || true

echo ">>> Done. Files:"
ls -la "$OUTDIR"
