#!/usr/bin/env bash
# Verify the ibsim lab image has everything IB01 expects. Run after setup/install.sh.
#
# Usage: setup/verify.sh
set -euo pipefail
IMAGE_TAG="${IBSIM_LAB_IMAGE:-ibsim-lab:latest}"

run() { docker run --rm "${IMAGE_TAG}" bash -c "$1"; }

echo "### which: binaries on PATH"
run "which ibsim ibsim-run ibnetdiscover opensm ibroute ibtracert iblinkinfo ibstat ibstatus ibportstate ibqueryerrors ibping"

echo
echo "### ibsim --help"
run "ibsim --help" || true   # ibsim prints usage and exits non-zero for --help; that's expected

echo
echo "### ibnetdiscover --help (first 5 lines)"
run "ibnetdiscover --help 2>&1 | head -5"

echo
echo "### opensm --version"
run "opensm --version"

echo
echo "### ldconfig -p | grep -E 'ibmad|ibumad'"
run "ldconfig -p | grep -E 'ibmad|ibumad'"

echo
echo "### the umad2sim shim (what makes LD_PRELOAD work)"
run "find / -xdev -iname 'libumad2sim*.so' 2>/dev/null | grep ."   # grep fails the check when find matches nothing

echo
echo "All checks passed. Next: lab01/README.md"
