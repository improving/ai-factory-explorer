#!/usr/bin/env bash
# Shared config/helpers for scripts/*.sh. Sourced, not executed directly.

: "${IBSIM_LAB_IMAGE:=ibsim-lab:latest}"
: "${IBSIM_LAB_CONTAINER:=ibsim-lab}"
: "${IBSIM_LAB_TMUX_SESSION:=ibsim}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

require_docker() {
    command -v docker >/dev/null 2>&1 || { echo "ERROR: docker not found. See ../setup/install.sh." >&2; exit 1; }
}

container_running() {
    docker ps --format '{{.Names}}' | grep -qx "${IBSIM_LAB_CONTAINER}"
}

require_container() {
    if ! container_running; then
        echo "ERROR: container '${IBSIM_LAB_CONTAINER}' is not running. Run scripts/start-sim.sh first." >&2
        exit 1
    fi
}

# Run a diagnostic command (ibnetdiscover, opensm, ibroute, ...) inside the lab container with
# libumad2sim.so preloaded, exactly the mechanism ARCHITECTURE.md section 6 describes.
# Usage: dexec "ibnetdiscover -l"
dexec() {
    docker exec "${IBSIM_LAB_CONTAINER}" bash -c '
        SO=$(find /usr/lib -iname "libumad2sim*.so" 2>/dev/null | head -1)
        if [ -z "$SO" ]; then echo "ERROR: libumad2sim.so not found in container" >&2; exit 1; fi
        export LD_PRELOAD="$SO"
        '"$1"'
    '
}

# Send one console command to the running ibsim's tmux session (Start/Dump/Unlink/ReLink/Error/...).
# Usage: sim_console 'Unlink "Switch1"[3]'
sim_console() {
    docker exec "${IBSIM_LAB_CONTAINER}" tmux send-keys -t "${IBSIM_LAB_TMUX_SESSION}" "$1" Enter
}

# Capture whatever the ibsim console has printed so far (its reply to the last sim_console call, etc).
# tmux pads the pane with blank lines up to its configured height, so strip those before `tail`ing.
sim_console_output() {
    docker exec "${IBSIM_LAB_CONTAINER}" tmux capture-pane -t "${IBSIM_LAB_TMUX_SESSION}" -p | sed '/^$/d'
}
